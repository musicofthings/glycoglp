"""
Planner Agent — defines phase execution plans, allocates tools,
tracks candidate counts, and enforces compute budgets.

Outputs structured PlannerOutput JSON consumed by all downstream agents.
"""
from __future__ import annotations

import json
import logging
from typing import List

from agents.models import PlannerOutput

log = logging.getLogger(__name__)


class PlannerAgent:
    """
    Stateless planning agent.  Call plan(phase) to get the execution plan
    for that phase; the returned PlannerOutput is broadcast to all agents.
    """

    PHASE_PLANS = {
        1: PlannerOutput(
            phase="Phase 1 — Masking Feasibility",
            tasks=[
                "Generate 50 glycoconjugate candidates (glycan × position × backbone)",
                "Predict complex structures via AF3 proxy scoring",
                "Run short MD equivalent (≤20 ns) for top 50",
                "Calculate SASA suppression for activation domain (residues 7–14)",
                "Assess masked binding score",
                "Apply Gate 1: ≥50% SASA suppression AND binding not permanently disrupted",
                "Prune to top 10 candidates",
            ],
            tools=[
                "custom_glycan_builder (GLYCAM format)",
                "AF3_structure_proxy (pLDDT-based confidence)",
                "OpenMM_short_MD_heuristic",
                "SASA_shrake_rupley_model",
                "PyRosetta_fa_scorefxn_proxy",
            ],
            candidate_limit=50,
            notes=(
                "Only biantennary-class glycans expected to pass Gate 1 (≥50% SASA). "
                "Monosaccharide and O-linked core-1 variants serve as negative controls. "
                "Retry once with modified attachment if gate fails."
            ),
        ),
        2: PlannerOutput(
            phase="Phase 2 — Linker Timing",
            tasks=[
                "Enumerate ≤20 linker variants per surviving candidate",
                "Estimate cleavage half-life via QM heuristics (ORCA proxy) or published kinetics",
                "Generate temporal activation curves (t = 0, 1, 2, 4, 8, 12, 24 h)",
                "Apply Gate 2: t½ ∈ [1–6 h] AND delayed activation confirmed",
                "Prune to top 5 candidates",
            ],
            tools=[
                "linker_kinetics_heuristic (ORCA/semi-empirical proxy)",
                "scipy_ode_activation_model",
                "RDKit_linker_SMILES_validation",
            ],
            candidate_limit=10,
            notes=(
                "Ester linkers (t½ <1 h) will fail gate; hydrazone (t½ >6 h) borderline. "
                "Target window: PABC ester (2.4 h), disulfide (3.2 h), carbonate (1.8 h)."
            ),
        ),
        3: PlannerOutput(
            phase="Phase 3 — Receptor Activation Optimization",
            tasks=[
                "Enumerate ≤50 mutation variants at positions 13–22 of GLP-1(7-36)",
                "Run PyRosetta Rosetta Energy score for each mutant complex",
                "Short MD stability assessment",
                "Estimate biased agonism profile (Gs vs β-arrestin, heuristic)",
                "Apply Gate 3: ≥70% predicted efficacy AND no major binding loss",
                "Prune to top 3 candidates",
            ],
            tools=[
                "PyRosetta_mutate_residue",
                "PyRosetta_fa_scorefxn",
                "ProteinMPNN_sequence_scoring_proxy",
                "OpenMM_stability_heuristic",
            ],
            candidate_limit=5,
            notes=(
                "Focus mutations: Y19F (hydrophobic optimization), K26R (receptor salt bridge), "
                "S18A (DPP-4 resistance), E21Q (helical stabilization). "
                "Aib substitutions at 8/18 considered for metabolic stability."
            ),
        ),
        4: PlannerOutput(
            phase="Phase 4 — Temporal PK Model",
            tasks=[
                "Build ODE-based PK/PD model for each top-3 candidate",
                "Compute early activation (0–2 h) and late activation (2–24 h)",
                "Calculate late/early activation ratio vs baseline GLP-1",
                "Apply Gate 4: late/early ratio significantly improved (>3× baseline)",
            ],
            tools=[
                "scipy_integrate_odeint",
                "numpy_pharmacokinetic_model",
            ],
            candidate_limit=3,
            notes=(
                "Baseline GLP-1 has ~100% early activation; glyco-masked target is "
                "<30% early, >75% late for ≥3× improvement in late/early ratio."
            ),
        ),
        5: PlannerOutput(
            phase="Phase 5 — Final Selection & FEP",
            tasks=[
                "Apply weighted composite scoring to all Phase 4 survivors",
                "Optional: FEP binding free energy for top-2 (if compute available)",
                "Generate synthesis recommendations",
                "Produce final ranked report",
            ],
            tools=[
                "composite_scorer",
                "FEP_openMM_alchemical_proxy",
                "synthesis_feasibility_checker",
            ],
            candidate_limit=3,
            notes=(
                "Score = 0.30×masking + 0.25×timing + 0.25×binding + 0.20×stability. "
                "Select top 2–3 for synthesis."
            ),
        ),
    }

    def plan(self, phase: int) -> PlannerOutput:
        if phase not in self.PHASE_PLANS:
            raise ValueError(f"No plan defined for phase {phase}")
        plan = self.PHASE_PLANS[phase]
        log.info("[PLANNER] Phase %d plan: limit=%d, tasks=%d",
                 phase, plan.candidate_limit, len(plan.tasks))
        return plan

    def broadcast(self, phase: int) -> str:
        """Return JSON string of the plan for inter-agent messaging."""
        return self.plan(phase).to_json()

    def summarize_all(self) -> List[dict]:
        return [
            {
                "phase": p,
                "name": plan.phase,
                "candidate_limit": plan.candidate_limit,
                "n_tasks": len(plan.tasks),
            }
            for p, plan in self.PHASE_PLANS.items()
        ]
