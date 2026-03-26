"""
Shared data models for the GLP-1 Glyco-Masking multi-agent pipeline.

All inter-agent communication uses these dataclasses, serialized as JSON.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# GLP-1 Reference Data
# ---------------------------------------------------------------------------

# GLP-1(7-36)-NH2: canonical sequence, positions numbered 7–36 (1-indexed 7)
GLP1_SEQUENCE = "HAEGTFTSDVSSYLEGQAAKEFIAWLVKGR"
# Position offset: index i in string → residue number (i + 7)
GLP1_OFFSET = 7  # string[0] = residue 7

# Critical binding domain: residues 7–14 (indices 0–7 in the string)
ACTIVATION_DOMAIN = list(range(0, 8))  # string indices 0..7  (His7..Ser14)

# One-letter amino acid molecular weights (monoisotopic, Da)
AA_MW: Dict[str, float] = {
    "G": 57.02, "A": 71.04, "V": 99.07, "L": 113.08, "I": 113.08,
    "P": 97.05, "F": 147.07, "W": 186.08, "M": 131.04, "S": 87.03,
    "T": 101.05, "C": 103.01, "Y": 163.06, "H": 137.06, "D": 115.03,
    "E": 129.04, "N": 114.04, "Q": 128.06, "K": 128.09, "R": 156.10,
}

# Glycan reference data (MW in Da, effective hydrodynamic radius in Å)
GLYCAN_CATALOG: Dict[str, Dict[str, Any]] = {
    "monosaccharide_GlcNAc2": {
        "description": "Di-GlcNAc chitobiose core",
        "mw": 442.4,
        "effective_radius_A": 6.0,
        "n_sugars": 2,
        "glycam_code": "4YB-0GB",
        "linkage": "N-linked",
        # SASA suppression fractions by attachment position (GLP-1 local pos 2/3)
        "sasa_supp": {2: 0.27, 3: 0.21},
        # Residual binding in masked state (fraction of unmodified)
        "masked_binding_fraction": {2: 0.72, 3: 0.78},
    },
    "biantennary_core": {
        "description": "Man3GlcNAc4 complex biantennary core",
        "mw": 1236.1,
        "effective_radius_A": 12.0,
        "n_sugars": 7,
        "glycam_code": "4YB-4YB-VMB-0VB-4YB-4YB",
        "linkage": "N-linked",
        "sasa_supp": {2: 0.53, 3: 0.48},
        "masked_binding_fraction": {2: 0.52, 3: 0.58},
    },
    "biantennary_sialylated": {
        "description": "Complex biantennary sialylated N-glycan (SA2Gal2GlcNAc2Man3GlcNAc2)",
        "mw": 2413.5,
        "effective_radius_A": 17.5,
        "n_sugars": 11,
        "glycam_code": "4YB-4YB-VMB-0VB-0MA-2MA-4YB-4YB-0GA-0GA-4SB-4SB",
        "linkage": "N-linked",
        "sasa_supp": {2: 0.68, 3: 0.62},
        "masked_binding_fraction": {2: 0.34, 3: 0.40},
    },
    "core1_o_linked": {
        "description": "Core-1 O-linked (Galβ1-3GalNAcα-Thr/Ser)",
        "mw": 384.3,
        "effective_radius_A": 5.8,
        "n_sugars": 2,
        "glycam_code": "0LB-0LA",
        "linkage": "O-linked",
        "sasa_supp": {2: 0.23, 3: 0.18},
        "masked_binding_fraction": {2: 0.75, 3: 0.80},
    },
}

# Linker catalog: cleavage mechanisms and half-lives (physiological pH 7.4, 37°C)
LINKER_CATALOG: Dict[str, Dict[str, Any]] = {
    "PABC_ester": {
        "name": "para-Aminobenzyl carbamate / ester prodrug",
        "smiles": "O=C(Nc1ccc(CO)cc1)CCCC(=O)O",  # simplified PABC scaffold
        "mechanism": "Esterase-mediated hydrolysis followed by 1,6-elimination",
        "half_life_h": 2.4,
        "half_life_sd": 0.3,
        "cleavage_enzyme": "carboxylesterase",
        "stability_score": 0.86,
        "linker_length_atoms": 12,
    },
    "ester_simple": {
        "name": "Simple aliphatic ester",
        "smiles": "OC(=O)CCC(=O)O",
        "mechanism": "Spontaneous ester hydrolysis (pH-dependent)",
        "half_life_h": 0.7,
        "half_life_sd": 0.15,
        "cleavage_enzyme": "spontaneous",
        "stability_score": 0.70,
        "linker_length_atoms": 6,
    },
    "carbonate": {
        "name": "Carbonate ester",
        "smiles": "OC(=O)OCCC(=O)O",
        "mechanism": "Carbonate hydrolysis, pH-sensitive",
        "half_life_h": 1.8,
        "half_life_sd": 0.25,
        "cleavage_enzyme": "spontaneous / carbamate hydrolase",
        "stability_score": 0.80,
        "linker_length_atoms": 9,
    },
    "disulfide": {
        "name": "Disulfide reductase-cleavable",
        "smiles": "SSCC(=O)O",
        "mechanism": "Glutathione-mediated disulfide reduction",
        "half_life_h": 3.2,
        "half_life_sd": 0.5,
        "cleavage_enzyme": "glutathione",
        "stability_score": 0.88,
        "linker_length_atoms": 8,
    },
    "cathepsin_GFLG": {
        "name": "Cathepsin B-cleavable tetrapeptide GFLG",
        "smiles": "NCC(=O)NC(Cc1ccccc1)C(=O)NC(CC(C)C)C(=O)NCC(=O)O",
        "mechanism": "Cathepsin B lysosomal protease cleavage",
        "half_life_h": 4.8,
        "half_life_sd": 0.6,
        "cleavage_enzyme": "cathepsin_B",
        "stability_score": 0.91,
        "linker_length_atoms": 20,
    },
    "pH_sensitive_hydrazone": {
        "name": "pH-sensitive hydrazone",
        "smiles": "NN=CC(=O)O",
        "mechanism": "Acid-catalyzed hydrazone hydrolysis (endosomal pH ~5.5)",
        "half_life_h": 6.5,
        "half_life_sd": 0.8,
        "cleavage_enzyme": "pH_acid",
        "stability_score": 0.75,
        "linker_length_atoms": 5,
    },
}

# Mutations for positions 13–22 of GLP-1(7-36) (local indices 6–15, residues 13–22)
# Each entry: {position (local 1-indexed in 7-36): [(wt_residue, mutant_residue, rationale)]}
MUTATION_CATALOG: Dict[int, List[tuple]] = {
    13: [("T", "S", "Conservative, maintains hydroxyl"),
         ("T", "N", "Adds hydrogen bond donor")],
    14: [("S", "T", "Slight bulk increase, stabilizes helix"),
         ("S", "A", "Removes hydroxyl, reduces metabolic liability")],
    17: [("S", "T", "Mild improvement in helical propensity")],
    18: [("S", "A", "DPP-4 resistance, Aib equivalent")],
    19: [("Y", "F", "Removes hydroxyl, slightly more hydrophobic"),
         ("Y", "W", "Larger aromatic, may improve receptor contact")],
    20: [("L", "I", "Conservative branched chain")],
    21: [("E", "Q", "Removes negative charge, neutral amide")],
    22: [("G", "A", "Helix-stabilizing methyl addition")],
}


# ---------------------------------------------------------------------------
# Core dataclasses
# ---------------------------------------------------------------------------

@dataclass
class Modification:
    type: str          # "glycan", "linker", "mutation", "termini"
    position: int      # residue position (1-indexed in GLP-1(7-36) local numbering)
    detail: str        # human-readable label
    smiles: Optional[str] = None


@dataclass
class Candidate:
    candidate_id: str
    phase_generated: int
    sequence: str                          # Modified GLP-1(7-36) sequence
    modifications: List[Modification]

    # Glycan / linker identity
    glycan_type: str = ""
    glycan_position: int = 2               # local position in 7-36 numbering
    linker_type: str = ""
    mutations: List[Dict[str, Any]] = field(default_factory=list)

    # Phase 1 evaluation results
    sasa_suppression_pct: float = 0.0      # % suppression of activation domain SASA
    masked_binding_score: float = 0.0     # binding in masked state (normalized)
    af3_confidence: float = 0.0            # AlphaFold3 pLDDT proxy

    # Phase 2 evaluation results
    linker_half_life_h: float = 0.0
    activation_curve: List[float] = field(default_factory=list)  # activity at t=[0,1,2,4,8,12,24]h
    timing_quality: float = 0.0            # delayed-activation quality metric

    # Phase 3 evaluation results
    unmasked_binding_score: float = 0.0   # binding after cleavage (normalized)
    predicted_efficacy_pct: float = 0.0   # % of baseline GLP-1R activation

    # Phase 4 PK results
    early_activation: float = 0.0         # mean 0–2h activation
    late_activation: float = 0.0          # mean 2–24h activation
    late_early_ratio: float = 0.0

    # Phase 5 scoring
    masking_score: float = 0.0
    timing_score: float = 0.0
    binding_score: float = 0.0
    stability_score: float = 0.0
    final_score: float = 0.0
    rank: int = 0

    # Gate outcomes
    passed_gate1: bool = False
    passed_gate2: bool = False
    passed_gate3: bool = False
    passed_gate4: bool = False

    # Synthesis readiness
    estimated_mw_da: float = 0.0
    synthesis_notes: str = ""

    def to_json(self) -> str:
        d = asdict(self)
        return json.dumps(d, indent=2)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "Candidate":
        mods = [Modification(**m) for m in d.pop("modifications", [])]
        return cls(modifications=mods, **d)


@dataclass
class PlannerOutput:
    phase: str
    tasks: List[str]
    tools: List[str]
    candidate_limit: int
    notes: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


@dataclass
class GateDecision:
    phase: int
    gate_id: str
    passed: bool
    candidates_in: int
    candidates_out: int
    criteria_met: Dict[str, bool]
    action: str   # "proceed", "retry_with_modification", "terminate"
    pruned_ids: List[str] = field(default_factory=list)
    notes: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


@dataclass
class FinalReport:
    top_candidates: List[Dict[str, Any]]
    baseline_comparison: Dict[str, Any]
    recommendation: Dict[str, str]
    phase_summary: List[Dict[str, Any]]

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)
