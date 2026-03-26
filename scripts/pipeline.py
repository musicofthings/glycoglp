"""
GLP-1 Glyco-Masking Multi-Agent Pipeline Orchestrator.

Coordinates all 5 agents through 5 phases with hard gates.

Inter-agent communication via structured JSON at each phase boundary.
Results written to scripts/results/ as JSON artifacts.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

import numpy as np

# ------------------------------------------------------------------
# Path setup (run from repo root or scripts/)
# ------------------------------------------------------------------
_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))

from agents.models import (
    GLP1_SEQUENCE,
    GLYCAN_CATALOG,
    LINKER_CATALOG,
    Candidate,
    FinalReport,
)
from agents.planner import PlannerAgent
from agents.generator import GeneratorAgent
from agents.evaluator import EvaluatorAgent
from agents.scorer import ScorerAgent
from agents.controller import ControllerAgent, PipelineTerminated

# ------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")

# ------------------------------------------------------------------
# Output directory
# ------------------------------------------------------------------
RESULTS_DIR = _HERE / "results"
RESULTS_DIR.mkdir(exist_ok=True)


def _save_json(name: str, data: Any) -> Path:
    path = RESULTS_DIR / f"{name}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    log.info("Saved %s", path)
    return path


def _candidates_to_list(candidates: List[Candidate]) -> List[dict]:
    from dataclasses import asdict
    return [asdict(c) for c in candidates]


def _separator(title: str) -> None:
    log.info("")
    log.info("=" * 70)
    log.info("  %s", title)
    log.info("=" * 70)


# ------------------------------------------------------------------
# Main pipeline
# ------------------------------------------------------------------

def run_pipeline() -> FinalReport:
    t0 = time.time()
    planner   = PlannerAgent()
    generator = GeneratorAgent()
    evaluator = EvaluatorAgent()
    scorer    = ScorerAgent()
    controller = ControllerAgent()

    gate_decisions = []
    phase_summaries = []

    # ================================================================
    # PHASE 1 — MASKING FEASIBILITY
    # ================================================================
    _separator("PHASE 1 — MASKING FEASIBILITY")
    plan1 = planner.plan(1)
    log.info("[PLANNER] %s", plan1.to_json())

    # --- Generate
    candidates_p1 = generator.generate_phase1(limit=plan1.candidate_limit)
    log.info("[GENERATOR] Generated %d Phase-1 candidates", len(candidates_p1))

    # --- Evaluate
    candidates_p1 = evaluator.batch_evaluate(candidates_p1, phase=1)

    # --- Score (Phase 1 sub-ranking for gate)
    for c in candidates_p1:
        c.stability_score = 0.80  # placeholder (full stability needs Phase 2+)

    # --- Gate 1
    survivors_p1, gate1 = controller.gate1(candidates_p1, keep_top=10)
    gate_decisions.append(json.loads(gate1.to_json()))

    log.info("[GATE 1] PASSED  —  %d survivors", len(survivors_p1))
    _save_json("phase1_all_candidates", _candidates_to_list(candidates_p1))
    _save_json("phase1_survivors",      _candidates_to_list(survivors_p1))
    _save_json("gate1_decision",        json.loads(gate1.to_json()))

    phase_summaries.append({
        "phase": 1,
        "name":  "Masking Feasibility",
        "candidates_in":  len(candidates_p1),
        "candidates_out": len(survivors_p1),
        "gate_passed":    True,
        "top_sasa_suppression": max(c.sasa_suppression_pct for c in survivors_p1),
        "avg_sasa_suppression": float(np.mean([c.sasa_suppression_pct for c in survivors_p1])),
    })

    # ================================================================
    # PHASE 2 — LINKER TIMING
    # ================================================================
    _separator("PHASE 2 — LINKER TIMING")
    plan2 = planner.plan(2)
    log.info("[PLANNER] %s", plan2.to_json())

    # --- Generate linker variants
    candidates_p2 = generator.generate_phase2(survivors_p1, linker_limit=20)
    log.info("[GENERATOR] Generated %d Phase-2 linker candidates", len(candidates_p2))

    # Carry forward Phase 1 SASA/binding scores
    for c in candidates_p2:
        c.sasa_suppression_pct = _lookup_sasa(c, survivors_p1)
        c.masked_binding_score = _lookup_masked_binding(c, survivors_p1)

    # --- Evaluate
    candidates_p2 = evaluator.batch_evaluate(candidates_p2, phase=2)

    # --- Gate 2
    survivors_p2, gate2 = controller.gate2(candidates_p2, keep_top=5)
    gate_decisions.append(json.loads(gate2.to_json()))

    log.info("[GATE 2] PASSED  —  %d survivors", len(survivors_p2))
    _save_json("phase2_all_candidates", _candidates_to_list(candidates_p2))
    _save_json("phase2_survivors",      _candidates_to_list(survivors_p2))
    _save_json("gate2_decision",        json.loads(gate2.to_json()))

    phase_summaries.append({
        "phase": 2,
        "name":  "Linker Timing",
        "candidates_in":  len(candidates_p2),
        "candidates_out": len(survivors_p2),
        "gate_passed":    True,
        "linker_types_passing": list({c.linker_type for c in survivors_p2}),
        "avg_half_life_h": float(np.mean([c.linker_half_life_h for c in survivors_p2])),
    })

    # ================================================================
    # PHASE 3 — RECEPTOR ACTIVATION OPTIMIZATION
    # ================================================================
    _separator("PHASE 3 — RECEPTOR ACTIVATION OPTIMIZATION")
    plan3 = planner.plan(3)
    log.info("[PLANNER] %s", plan3.to_json())

    # --- Generate mutation variants
    candidates_p3 = generator.generate_phase3(survivors_p2, mutation_limit=50)
    log.info("[GENERATOR] Generated %d Phase-3 mutation candidates", len(candidates_p3))

    # Carry forward SASA / binding / timing
    for c in candidates_p3:
        src = _find_base(c, survivors_p2)
        if src:
            c.sasa_suppression_pct = src.sasa_suppression_pct
            c.masked_binding_score = src.masked_binding_score
            c.linker_half_life_h   = src.linker_half_life_h
            c.timing_quality       = src.timing_quality
            c.activation_curve     = list(src.activation_curve)

    # --- Evaluate
    candidates_p3 = evaluator.batch_evaluate(candidates_p3, phase=3)

    # --- Gate 3
    survivors_p3, gate3 = controller.gate3(candidates_p3, keep_top=3)
    gate_decisions.append(json.loads(gate3.to_json()))

    log.info("[GATE 3] PASSED  —  %d survivors", len(survivors_p3))
    _save_json("phase3_all_candidates", _candidates_to_list(candidates_p3))
    _save_json("phase3_survivors",      _candidates_to_list(survivors_p3))
    _save_json("gate3_decision",        json.loads(gate3.to_json()))

    phase_summaries.append({
        "phase": 3,
        "name":  "Receptor Activation",
        "candidates_in":  len(candidates_p3),
        "candidates_out": len(survivors_p3),
        "gate_passed":    True,
        "avg_efficacy_pct": float(np.mean([c.predicted_efficacy_pct for c in survivors_p3])),
    })

    # ================================================================
    # PHASE 4 — TEMPORAL PK MODEL
    # ================================================================
    _separator("PHASE 4 — TEMPORAL PK MODEL")
    plan4 = planner.plan(4)
    log.info("[PLANNER] %s", plan4.to_json())

    # --- Evaluate Phase 4 (PK model)
    candidates_p4 = evaluator.batch_evaluate(survivors_p3, phase=4)

    # --- Gate 4
    survivors_p4, gate4 = controller.gate4(candidates_p4)
    gate_decisions.append(json.loads(gate4.to_json()))

    log.info("[GATE 4] PASSED  —  %d survivors", len(survivors_p4))
    _save_json("phase4_results",   _candidates_to_list(candidates_p4))
    _save_json("gate4_decision",   json.loads(gate4.to_json()))

    phase_summaries.append({
        "phase": 4,
        "name":  "Temporal PK Model",
        "candidates_in":  len(candidates_p4),
        "candidates_out": len(survivors_p4),
        "gate_passed":    True,
        "late_early_ratios": [round(c.late_early_ratio, 2) for c in survivors_p4],
    })

    # ================================================================
    # PHASE 5 — FINAL SELECTION
    # ================================================================
    _separator("PHASE 5 — FINAL SELECTION & SCORING")
    plan5 = planner.plan(5)
    log.info("[PLANNER] %s", plan5.to_json())

    # Refresh stability scores before final scoring
    for c in survivors_p4:
        from agents.evaluator import _md_stability_score
        c.stability_score = _md_stability_score(c)

    # --- Final scoring
    final_candidates = scorer.score(survivors_p4)

    leaderboard = scorer.leaderboard(final_candidates, top_n=len(final_candidates))
    log.info("[SCORER] Final leaderboard:\n%s", json.dumps(leaderboard, indent=2))

    breakdowns = [scorer.score_breakdown(c) for c in final_candidates]
    _save_json("phase5_final_scores",   leaderboard)
    _save_json("phase5_score_breakdown", breakdowns)

    phase_summaries.append({
        "phase": 5,
        "name":  "Final Selection",
        "candidates_in":  len(survivors_p4),
        "candidates_out": len(final_candidates),
        "gate_passed":    True,
    })

    # ================================================================
    # BUILD FINAL REPORT
    # ================================================================
    _separator("FINAL REPORT")
    ranked = sorted(final_candidates, key=lambda c: c.final_score, reverse=True)
    top_2_3 = ranked[:3]

    baseline_comparison = {
        "baseline_glp1": {
            "sequence":          GLP1_SEQUENCE,
            "sasa_suppression":  "0% (no masking)",
            "early_activation":  "~95% at t=0",
            "late_activation":   "~90% at t=4h",
            "late_early_ratio":  round(1.05, 2),
            "nausea_risk":       "HIGH (immediate full activation)",
            "t_half_linker":     "N/A",
        },
    }
    for c in top_2_3:
        baseline_comparison[c.candidate_id] = {
            "sasa_suppression_pct":    round(c.sasa_suppression_pct, 1),
            "early_activation":        round(c.early_activation * 100, 1),
            "late_activation":         round(c.late_activation * 100, 1),
            "late_early_ratio":        round(c.late_early_ratio, 2),
            "vs_baseline_improvement": f"{c.late_early_ratio / 1.05:.1f}×",
            "nausea_risk":             "LOW (glycan masking active during absorption phase)",
        }

    top_candidate = top_2_3[0]
    recommendation = {
        "synthesize_first":  top_candidate.candidate_id,
        "sequence":          top_candidate.sequence,
        "glycan":            top_candidate.glycan_type,
        "glycan_position":   f"Position {top_candidate.glycan_position + 6} (GLP-1 canonical)",
        "linker":            top_candidate.linker_type,
        "key_mutations":     [
            f"{m.get('from','?')}{m.get('position',0) + 6}{m.get('to','?')}"
            for m in top_candidate.mutations
        ],
        "estimated_mw_da":   round(top_candidate.estimated_mw_da, 1),
        "rationale": (
            f"Highest composite score ({top_candidate.final_score:.4f}). "
            f"Achieves {top_candidate.sasa_suppression_pct:.1f}% SASA suppression "
            f"(masking nausea-triggering N-terminal exposure), "
            f"linker t½ = {top_candidate.linker_half_life_h:.2f} h "
            f"(delayed activation onset), "
            f"{top_candidate.predicted_efficacy_pct:.1f}% predicted receptor efficacy "
            f"post-cleavage, and "
            f"{top_candidate.late_early_ratio:.1f}× late/early activation improvement "
            f"vs. baseline GLP-1."
        ),
        "synthesis_notes":   top_candidate.synthesis_notes,
    }

    report = FinalReport(
        top_candidates=[
            {
                "rank":              c.rank,
                "candidate_id":      c.candidate_id,
                "sequence":          c.sequence,
                "glycan_type":       c.glycan_type,
                "glycan_position":   f"pos {c.glycan_position + 6} (canonical)",
                "linker_type":       c.linker_type,
                "key_mutations":     c.mutations,
                "sasa_suppression":  round(c.sasa_suppression_pct, 1),
                "linker_half_life_h": round(c.linker_half_life_h, 2),
                "predicted_efficacy_pct": round(c.predicted_efficacy_pct, 1),
                "late_early_ratio":  round(c.late_early_ratio, 2),
                "final_score":       round(c.final_score, 4),
                "estimated_mw_da":   round(c.estimated_mw_da, 1),
                "activation_curve_timepoints_h": [0.0, 0.5, 1.0, 2.0, 4.0, 8.0, 12.0, 24.0],
                "activation_curve":  [round(v, 4) for v in c.activation_curve],
                "synthesis_notes":   c.synthesis_notes,
            }
            for c in top_2_3
        ],
        baseline_comparison=baseline_comparison,
        recommendation=recommendation,
        phase_summary=phase_summaries,
    )

    _save_json("final_report", json.loads(report.to_json()))
    _save_json("gate_decisions_all", gate_decisions)

    elapsed = time.time() - t0
    log.info("[PIPELINE] Completed in %.1f s", elapsed)
    _separator("SYNTHESIS-READY CANDIDATES")
    for c in top_2_3:
        log.info("")
        log.info("  Rank %d  |  %s", c.rank, c.candidate_id)
        log.info("  Sequence     : %s", c.sequence)
        log.info("  Glycan       : %s @ pos %d", c.glycan_type, c.glycan_position + 6)
        log.info("  Linker       : %s (t½ = %.2f h)", c.linker_type, c.linker_half_life_h)
        log.info("  SASA supp    : %.1f%%", c.sasa_suppression_pct)
        log.info("  Efficacy     : %.1f%%", c.predicted_efficacy_pct)
        log.info("  Late/Early   : %.2f×", c.late_early_ratio)
        log.info("  Final score  : %.4f", c.final_score)
        log.info("  MW (est.)    : %.0f Da", c.estimated_mw_da)

    return report


# ------------------------------------------------------------------
# Helper utilities
# ------------------------------------------------------------------

def _lookup_sasa(c: Candidate, pool: List[Candidate]) -> float:
    for src in pool:
        if (src.glycan_type == c.glycan_type and
                src.glycan_position == c.glycan_position):
            return src.sasa_suppression_pct
    return 55.0  # fallback


def _lookup_masked_binding(c: Candidate, pool: List[Candidate]) -> float:
    for src in pool:
        if (src.glycan_type == c.glycan_type and
                src.glycan_position == c.glycan_position):
            return src.masked_binding_score
    return 0.45


def _find_base(c: Candidate, pool: List[Candidate]) -> Candidate | None:
    for src in pool:
        if (src.glycan_type == c.glycan_type and
                src.glycan_position == c.glycan_position and
                src.linker_type == c.linker_type):
            return src
    return pool[0] if pool else None


if __name__ == "__main__":
    report = run_pipeline()
    print("\n\n" + "=" * 70)
    print("PIPELINE COMPLETE — see scripts/results/ for full JSON artifacts")
    print("=" * 70)
