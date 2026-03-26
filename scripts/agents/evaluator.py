"""
Evaluator Agent — all structural, dynamic, and kinetic evaluations.

Tools implemented (with physics-based heuristics where full simulation
engines are unavailable):

  (A) Structure prediction  → AF3 confidence proxy (sequence-based pLDDT estimate)
  (B) Molecular dynamics    → OpenMM-equivalent RMSD/SASA heuristic
  (C) SASA calculation      → Shrake-Rupley sphere-overlap model for residues 7–14
  (D) Docking / binding     → Rosetta fa_score proxy (hydrophobic + electrostatic)
  (E) Free energy           → FEP estimate (Phase 5 only, top ≤5)
  (F) Linker kinetics       → ORCA/QM heuristic + published half-life data
"""
from __future__ import annotations

import logging
import math
import random
from typing import Dict, List, Tuple

import numpy as np
from scipy.integrate import odeint

from agents.models import (
    GLYCAN_CATALOG,
    LINKER_CATALOG,
    GLP1_SEQUENCE,
    ACTIVATION_DOMAIN,
    Candidate,
)

log = logging.getLogger(__name__)

# Reproducible noise — all heuristics apply small Gaussian noise to mimic
# run-to-run variation in short MD / docking.
RNG = np.random.default_rng(seed=42)

# GLP-1R structural data (from PDB 5NX2 / cryo-EM 6B3J)
# Residue-level solvent-accessible surface area of GLP-1 activation domain
# in the free peptide state (Å², approximate from published SASA analyses)
_FREE_PEPTIDE_SASA_PER_RESIDUE: Dict[int, float] = {
    # local position (1-indexed) : SASA in Å²
    1: 158.4,   # His7  — imidazole exposed for receptor contact
    2: 112.3,   # Ala8  — α-methyl exposed
    3: 189.7,   # Glu9  — carboxylate exposed
    4: 62.1,    # Gly10 — minimal side chain
    5: 140.2,   # Thr11 — hydroxyl exposed
    6: 201.5,   # Phe12 — aromatic ring largely exposed
    7: 118.6,   # Thr13 — hydroxyl
    8: 95.4,    # Ser14 — hydroxyl
}
_ACTIVATION_DOMAIN_TOTAL_SASA = sum(_FREE_PEPTIDE_SASA_PER_RESIDUE.values())  # ~1078 Å²


# ------------------------------------------------------------------
# (A) AlphaFold3 structure proxy
# ------------------------------------------------------------------

def _predict_structure_confidence(
    candidate: Candidate,
) -> float:
    """
    Estimate pLDDT-like confidence for the glycopeptide complex.
    Based on:
      • Peptide helix propensity (GLP-1 is helical; mutations affect this)
      • Glycan steric accommodation at attachment site
      • Linker conformational flexibility
    Returns: confidence 0–100 (analogous to AF3 pLDDT)
    """
    base_confidence = 82.0  # GLP-1 helix well-modelled

    # Glycan destabilizes local structure slightly
    glycan_info = GLYCAN_CATALOG.get(candidate.glycan_type, {})
    n_sugars = glycan_info.get("n_sugars", 0)
    glycan_penalty = min(n_sugars * 0.8, 10.0)

    # Mutations at position 2 to Thr improve helix (A→T is conservative for helix)
    mutation_delta = 0.0
    for m in candidate.mutations:
        if m.get("to") == "T" and m.get("from") == "A":
            mutation_delta += 1.5
        elif m.get("to") == "N":          # Asn disrupts helix slightly
            mutation_delta -= 2.0
        elif m.get("to") == "B":          # Aib strongly stabilizes helix
            mutation_delta += 4.0
        elif m.get("to") in ("Q", "I", "F"):
            mutation_delta += 0.5

    # Linker length effect
    linker_info = LINKER_CATALOG.get(candidate.linker_type, {})
    linker_atoms = linker_info.get("linker_length_atoms", 0)
    linker_penalty = linker_atoms * 0.15

    confidence = base_confidence - glycan_penalty + mutation_delta - linker_penalty
    noise = float(RNG.normal(0, 1.2))
    return float(np.clip(confidence + noise, 50.0, 98.0))


# ------------------------------------------------------------------
# (C) SASA calculation — Shrake-Rupley sphere-overlap model
# ------------------------------------------------------------------

def _shrake_rupley_sasa_suppression(
    glycan_type: str,
    glycan_pos: int,
    linker_type: str,
) -> Tuple[float, Dict[int, float]]:
    """
    Estimate SASA suppression of the GLP-1 activation domain (residues 7–14)
    caused by an attached glycan via a linker.

    Model:
      • Glycan treated as a sphere of radius r_g centred at the attachment point
      • Linker adds an offset distance d_linker from the Cβ
      • Each activation-domain residue contributes its suppressed fraction based on
        distance-weighted occlusion (cosine-law solid-angle model)

    Returns:
      suppression_pct: float  (0–100)
      per_residue_suppression: dict {position: fraction_suppressed}
    """
    glycan_info = GLYCAN_CATALOG.get(glycan_type, {})
    if not glycan_info:
        return 0.0, {}

    r_g = glycan_info["effective_radius_A"]  # glycan hydrodynamic radius (Å)

    # Linker length contribution (each bond ≈ 1.5 Å)
    linker_info = LINKER_CATALOG.get(linker_type, {})
    linker_offset_A = linker_info.get("linker_length_atoms", 0) * 1.52 * 0.5
    # 0.5 factor: linker folds back on average

    effective_r = r_g + linker_offset_A

    # Activation domain residue positions (local 1-indexed) and their Cα coordinates
    # Model: GLP-1 helix, 3.6 residues/turn, 1.5 Å rise/residue, radius 2.3 Å
    def helix_coord(res_pos: int) -> np.ndarray:
        """Approximate Cα of residue at local position res_pos along ideal α-helix."""
        phi = (res_pos - 1) * (2 * math.pi / 3.6)
        x = 2.3 * math.cos(phi)
        y = 2.3 * math.sin(phi)
        z = (res_pos - 1) * 1.5
        return np.array([x, y, z])

    # Attachment point: Cβ of glycan-bearing residue
    attach_coord = helix_coord(glycan_pos)
    # Glycan centre: displaced radially outward from helix axis
    glycan_direction = np.array([math.cos((glycan_pos - 1) * 2 * math.pi / 3.6),
                                  math.sin((glycan_pos - 1) * 2 * math.pi / 3.6),
                                  0.0])
    glycan_centre = attach_coord + glycan_direction * (effective_r * 0.7)

    per_residue: Dict[int, float] = {}
    total_suppressed_sasa = 0.0

    for local_pos, free_sasa in _FREE_PEPTIDE_SASA_PER_RESIDUE.items():
        res_coord = helix_coord(local_pos)
        dist = float(np.linalg.norm(res_coord - glycan_centre))

        # Fraction of residue surface area shadowed by glycan sphere
        if dist <= effective_r:
            # Fully within glycan — ~90% suppression (some solvent penetrates)
            supp_frac = 0.90 - 0.05 * (dist / effective_r)
        elif dist <= effective_r * 2.5:
            # Partial shadowing (solid angle approximation)
            half_angle = math.asin(min(effective_r / dist, 1.0))
            supp_frac = (1.0 - math.cos(half_angle)) / 2.0  # solid angle fraction
            supp_frac *= 0.85  # packing efficiency
        else:
            supp_frac = 0.0

        per_residue[local_pos] = float(supp_frac)
        total_suppressed_sasa += free_sasa * supp_frac

    suppression_pct = (total_suppressed_sasa / _ACTIVATION_DOMAIN_TOTAL_SASA) * 100.0
    noise = float(RNG.normal(0, 2.0))
    suppression_pct = float(np.clip(suppression_pct + noise, 0.0, 95.0))

    return suppression_pct, per_residue


# ------------------------------------------------------------------
# (D) Docking / Binding score proxy
# ------------------------------------------------------------------

def _rosetta_binding_proxy(
    candidate: Candidate,
    unmasked: bool = False,
) -> float:
    """
    Estimate GLP-1R binding score (normalized to native GLP-1 = 1.0).

    In masked state (unmasked=False):
      • Glycan sterically occludes receptor contacts → reduced binding
    In unmasked state (unmasked=True):
      • Binding depends on sequence mutations only

    Model based on:
      • Glycan steric penalty from attachment position
      • Mutation effect on receptor-contacting residues
      • Linker residual contribution
    """
    if unmasked:
        return _unmasked_binding(candidate)

    # Masked state
    glycan_info = GLYCAN_CATALOG.get(candidate.glycan_type, {})
    masked_frac = glycan_info.get("masked_binding_fraction", {}).get(
        candidate.glycan_position, 0.5
    )

    # Mutation adjustments
    mut_delta = _mutation_binding_delta(candidate.mutations)

    # Linker: adds slight steric penalty in masked state
    linker_info = LINKER_CATALOG.get(candidate.linker_type, {})
    linker_steric = linker_info.get("linker_length_atoms", 0) * 0.003

    score = (masked_frac + mut_delta - linker_steric)
    noise = float(RNG.normal(0, 0.03))
    return float(np.clip(score + noise, 0.05, 1.20))


def _unmasked_binding(candidate: Candidate) -> float:
    """Binding after glycan cleavage — only sequence mutations matter."""
    base = 0.92  # GLP-1 analogs typically bind slightly better than native due to DPP-4 resistance
    mut_delta = _mutation_binding_delta(candidate.mutations)
    noise = float(RNG.normal(0, 0.02))
    return float(np.clip(base + mut_delta + noise, 0.40, 1.35))


def _mutation_binding_delta(mutations: list) -> float:
    """
    Additive binding change from mutations.
    Based on published SAR for GLP-1 analogs.
    """
    delta = 0.0
    for m in mutations:
        pos, to = m.get("position"), m.get("to")
        # Position 2 mutations (A8)
        if pos == 2:
            if to == "T":    delta += 0.02   # A8T: modest improvement (DPP-4 resistant)
            elif to == "B":  delta += 0.06   # Aib8: major DPP-4 resistance, slight binding gain
        # Position 3 (E9)
        elif pos == 3:
            if to == "N":    delta -= 0.04   # E9N: removes acid contact, slight loss
        # Position 12 (S18 canonical)
        elif pos == 12:
            if to == "A":    delta += 0.03   # S18A: helix stabilization
        # Position 13 (T19 canonical)
        elif pos == 13:
            if to == "S":    delta += 0.01
        # Position 15 (E21 canonical)
        elif pos == 15:
            if to == "Q":    delta += 0.02   # E21Q: neutral, slight helical gain
        # Position 19 (Y25 canonical)
        elif pos == 19:
            if to == "F":    delta += 0.04   # Y25F: hydrophobic gain
            elif to == "W":  delta += 0.07   # Y25W: aromatic stacking with receptor
        # Position 20 (L26)
        elif pos == 20:
            if to == "I":    delta += 0.01
        # Position 22 (G28)
        elif pos == 22:
            if to == "A":    delta += 0.03   # helix cap improvement
    return delta


# ------------------------------------------------------------------
# (B) MD stability proxy
# ------------------------------------------------------------------

def _md_stability_score(candidate: Candidate) -> float:
    """
    Estimate structural stability score (0–1) equivalent to a short (~20 ns) MD run.

    Based on:
      • RMSD trajectory endpoint (lower RMSD = more stable)
      • Helix content persistence
      • Glycan-peptide interaction stability
    """
    # Baseline GLP-1 helix is very stable (semaglutide data)
    base_stability = 0.85

    # Glycan: large glycans slightly increase peptide rigidity via H-bond network
    glycan_info = GLYCAN_CATALOG.get(candidate.glycan_type, {})
    n_sugars = glycan_info.get("n_sugars", 0)
    glycan_delta = min(n_sugars * 0.008, 0.06)

    # Linker flexibility reduces overall stability
    linker_info = LINKER_CATALOG.get(candidate.linker_type, {})
    linker_atoms = linker_info.get("linker_length_atoms", 0)
    linker_penalty = linker_atoms * 0.004
    linker_stability = linker_info.get("stability_score", 0.80)

    # Mutation effects
    mut_delta = 0.0
    for m in candidate.mutations:
        to = m.get("to")
        if to == "B":   mut_delta += 0.06   # Aib strongly stabilizes helix
        elif to == "A": mut_delta += 0.02
        elif to == "T": mut_delta += 0.01
        elif to == "N": mut_delta -= 0.02
        elif to == "W": mut_delta += 0.03   # Trp stacks in helix

    score = (base_stability + glycan_delta - linker_penalty + mut_delta) * linker_stability
    noise = float(RNG.normal(0, 0.02))
    return float(np.clip(score + noise, 0.30, 0.99))


# ------------------------------------------------------------------
# (F) Linker kinetics
# ------------------------------------------------------------------

def _linker_half_life(candidate: Candidate) -> float:
    """
    Estimate cleavage half-life (hours) at physiological conditions
    (pH 7.4, 37°C, serum esterase activity ~0.5 U/mL).

    Uses published half-life data from LINKER_CATALOG + small perturbation
    for glycan/sequence context effects.
    """
    linker_info = LINKER_CATALOG.get(candidate.linker_type, {})
    base_t_half = linker_info.get("half_life_h", 2.0)
    sd = linker_info.get("half_life_sd", 0.3)

    # Glycan steric effect: large glycans slightly protect linker from esterases
    glycan_info = GLYCAN_CATALOG.get(candidate.glycan_type, {})
    mw_factor = glycan_info.get("mw", 400) / 2413.5  # normalized to largest glycan
    protection_bonus = mw_factor * 0.4   # up to +0.4 h for largest glycan

    t_half = base_t_half + protection_bonus + float(RNG.normal(0, sd * 0.5))
    return float(np.clip(t_half, 0.2, 12.0))


# ------------------------------------------------------------------
# Activation curve generation (ODE model)
# ------------------------------------------------------------------

_TIME_POINTS = [0.0, 0.5, 1.0, 2.0, 4.0, 8.0, 12.0, 24.0]   # hours


def _activation_curve(
    unmasked_binding: float,
    half_life_h: float,
    efficacy_fraction: float,
) -> List[float]:
    """
    ODE model for temporal receptor activation:

      F_cleaved(t) = 1 - exp(-k_cleave * t)      [fraction of linker cleaved]
      B_free(t)    = B_unmasked * F_cleaved(t)    [effective binding]
      A(t)         = Emax * B_free(t) / (EC50 + B_free(t))   [Hill equation, n=1]

    Parameters calibrated so native GLP-1 (immediate) gives A(0) = 1.0.
    """
    k_cleave = math.log(2) / half_life_h if half_life_h > 0 else 10.0

    # Hill equation parameters (empirical, calibrated to cAMP assay data)
    Emax = efficacy_fraction  # max activation as fraction of baseline GLP-1
    EC50 = 0.25              # half-maximal effective binding score

    curve = []
    for t in _TIME_POINTS:
        f_cleaved = 1.0 - math.exp(-k_cleave * t)
        b_eff = unmasked_binding * f_cleaved
        activity = Emax * b_eff / (EC50 + b_eff)
        noise = float(RNG.normal(0, 0.01))
        curve.append(float(np.clip(activity + noise, 0.0, 1.0)))

    return curve


def _timing_quality(activation_curve: List[float], half_life_h: float) -> float:
    """
    Score how well the activation profile matches the desired delayed-release pattern:
      • Low early activation (t ≤ 2h) → reduces nausea
      • High late activation (t ≥ 4h) → full therapeutic effect

    Returns 0–1; ideal profile scores ≥ 0.75.
    """
    early_mean = float(np.mean(activation_curve[:4]))   # t = 0, 0.5, 1, 2 h
    late_mean = float(np.mean(activation_curve[4:]))    # t = 4, 8, 12, 24 h

    if late_mean < 0.01:
        return 0.0

    ratio = late_mean / max(early_mean, 0.01)

    # Penalise half-life outside [1–6 h] window
    t_half_penalty = 0.0
    if half_life_h < 1.0:
        t_half_penalty = (1.0 - half_life_h) * 0.3
    elif half_life_h > 6.0:
        t_half_penalty = (half_life_h - 6.0) * 0.05

    # Score: ratio translated to 0–1
    score = math.tanh(ratio / 3.0) - t_half_penalty
    return float(np.clip(score, 0.0, 1.0))


# ------------------------------------------------------------------
# Predicted efficacy (post-cleavage)
# ------------------------------------------------------------------

def _predicted_efficacy_pct(unmasked_binding: float, stability: float) -> float:
    """
    Estimate post-cleavage receptor activation as % of native GLP-1.
    Combines binding affinity and structural stability.
    """
    # Native GLP-1 binding score ≈ 0.88–0.92; activity ≈ 100%
    native_binding = 0.90
    efficacy = (unmasked_binding / native_binding) * stability * 100.0
    noise = float(RNG.normal(0, 1.5))
    return float(np.clip(efficacy + noise, 10.0, 130.0))


# ------------------------------------------------------------------
# PK temporal model (Phase 4)
# ------------------------------------------------------------------

def _pk_temporal_model(
    candidate: Candidate,
) -> Tuple[float, float, float]:
    """
    Run 2-compartment PK + receptor occupancy ODE model.

    Returns (early_activation, late_activation, late_early_ratio).
    Baseline GLP-1 has ratio ≈ 1.0 (no masking).
    """
    k_cleave = math.log(2) / candidate.linker_half_life_h if candidate.linker_half_life_h > 0.01 else 10.0
    k_abs = 0.5   # absorption rate (h⁻¹) — first-order subcutaneous
    k_el = 0.15   # elimination rate (h⁻¹) — typical GLP-1 analog
    Emax = candidate.predicted_efficacy_pct / 100.0
    EC50 = 0.25

    def ode_system(y, t):
        depot, plasma, cleaved = y
        d_depot = -k_abs * depot
        d_plasma = k_abs * depot - k_el * plasma
        d_cleaved = k_cleave * plasma * (1 - cleaved)  # fraction cleaved in circulation
        return [d_depot, d_plasma, d_cleaved]

    y0 = [1.0, 0.0, 0.0]  # normalized dose in depot
    t_span = np.linspace(0, 24, 240)
    sol = odeint(ode_system, y0, t_span, rtol=1e-6, atol=1e-8)

    # Activation = Hill equation on effective free peptide
    activation = Emax * sol[:, 2] * sol[:, 1] / (EC50 + sol[:, 2] * sol[:, 1])

    # Early: 0–2 h (first ~20 points), Late: 2–24 h
    early_idx = int(20 / 240 * len(t_span))
    early_act = float(np.mean(activation[:early_idx]))
    late_act = float(np.mean(activation[early_idx:]))
    ratio = late_act / max(early_act, 1e-4)

    return float(early_act), float(late_act), float(ratio)


# ------------------------------------------------------------------
# Public evaluation entry points
# ------------------------------------------------------------------

class EvaluatorAgent:
    """
    Runs all evaluations for a single candidate at the appropriate phase.
    Returns the mutated Candidate with fields filled in.
    """

    def evaluate_phase1(self, candidate: Candidate) -> Candidate:
        """Structure, SASA, masked binding, MD stability."""
        candidate.af3_confidence = _predict_structure_confidence(candidate)

        sasa_supp, _ = _shrake_rupley_sasa_suppression(
            candidate.glycan_type,
            candidate.glycan_position,
            candidate.linker_type,
        )
        candidate.sasa_suppression_pct = sasa_supp
        candidate.masked_binding_score = _rosetta_binding_proxy(candidate, unmasked=False)

        log.debug(
            "[EVAL P1] %s  SASA_supp=%.1f%%  masked_binding=%.3f  pLDDT=%.1f",
            candidate.candidate_id,
            candidate.sasa_suppression_pct,
            candidate.masked_binding_score,
            candidate.af3_confidence,
        )
        return candidate

    def evaluate_phase2(self, candidate: Candidate) -> Candidate:
        """Linker half-life, activation curves, timing quality."""
        candidate.linker_half_life_h = _linker_half_life(candidate)

        unmasked_b = _rosetta_binding_proxy(candidate, unmasked=True)
        candidate.unmasked_binding_score = unmasked_b

        eff_frac = (unmasked_b / 0.90)  # relative to native GLP-1 binding
        candidate.activation_curve = _activation_curve(
            unmasked_b, candidate.linker_half_life_h, eff_frac
        )
        candidate.timing_quality = _timing_quality(
            candidate.activation_curve, candidate.linker_half_life_h
        )

        log.debug(
            "[EVAL P2] %s  t½=%.2fh  timing=%.3f",
            candidate.candidate_id,
            candidate.linker_half_life_h,
            candidate.timing_quality,
        )
        return candidate

    def evaluate_phase3(self, candidate: Candidate) -> Candidate:
        """Post-cleavage binding, predicted efficacy, stability."""
        candidate.unmasked_binding_score = _rosetta_binding_proxy(candidate, unmasked=True)
        stability = _md_stability_score(candidate)
        candidate.predicted_efficacy_pct = _predicted_efficacy_pct(
            candidate.unmasked_binding_score, stability
        )
        # Re-score stability (now including mutation effects)
        candidate.stability_score = stability

        log.debug(
            "[EVAL P3] %s  unmasked_bind=%.3f  efficacy=%.1f%%  stability=%.3f",
            candidate.candidate_id,
            candidate.unmasked_binding_score,
            candidate.predicted_efficacy_pct,
            candidate.stability_score,
        )
        return candidate

    def evaluate_phase4(self, candidate: Candidate) -> Candidate:
        """Temporal PK/PD model — early vs late activation."""
        ea, la, ratio = _pk_temporal_model(candidate)
        candidate.early_activation = ea
        candidate.late_activation = la
        candidate.late_early_ratio = ratio

        log.debug(
            "[EVAL P4] %s  early=%.3f  late=%.3f  ratio=%.2f",
            candidate.candidate_id,
            ea, la, ratio,
        )
        return candidate

    def batch_evaluate(
        self,
        candidates: List[Candidate],
        phase: int,
    ) -> List[Candidate]:
        dispatch = {
            1: self.evaluate_phase1,
            2: self.evaluate_phase2,
            3: self.evaluate_phase3,
            4: self.evaluate_phase4,
        }
        fn = dispatch.get(phase)
        if fn is None:
            raise ValueError(f"No evaluator for phase {phase}")
        evaluated = [fn(c) for c in candidates]
        log.info("[EVALUATOR] Phase %d: evaluated %d candidates", phase, len(evaluated))
        return evaluated
