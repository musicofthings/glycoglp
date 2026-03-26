"""
Controller Agent — enforces kill gates and decides progression.

Gates:
  Gate 1 (Phase 1): SASA suppression ≥50% AND masked binding not zero
  Gate 2 (Phase 2): linker t½ ∈ [1–6 h] AND delayed activation confirmed
  Gate 3 (Phase 3): predicted efficacy ≥70% AND unmasked binding ≥0.60
  Gate 4 (Phase 4): late/early activation ratio ≥3× baseline GLP-1

Each gate prunes the candidate list to the specified maximum.
"""
from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from agents.models import Candidate, GateDecision

log = logging.getLogger(__name__)

# Baseline GLP-1 (no masking) late/early ratio ≈ 1.05 (nearly flat)
_BASELINE_LATE_EARLY_RATIO = 1.05
_GATE4_MIN_RATIO_IMPROVEMENT = 3.0   # must be ≥ 3× baseline


class ControllerAgent:
    """
    Stateless gate enforcement.  Each method applies a gate, returns
    (survivors, GateDecision).  If the gate fails it raises PipelineTerminated.
    """

    # ------------------------------------------------------------------
    # Gate 1 — Masking Feasibility
    # ------------------------------------------------------------------

    def gate1(
        self,
        candidates: List[Candidate],
        keep_top: int = 10,
        min_sasa_suppression_pct: float = 50.0,
        max_masked_binding_loss: float = 0.80,   # masked binding must be > 0
    ) -> Tuple[List[Candidate], GateDecision]:
        """
        Keep candidates where:
          • sasa_suppression_pct ≥ 50%
          • masked_binding_score > 0  (binding not irreversibly lost)
        """
        passing = []
        for c in candidates:
            sasa_ok = c.sasa_suppression_pct >= min_sasa_suppression_pct
            binding_ok = c.masked_binding_score > 0.05
            c.passed_gate1 = sasa_ok and binding_ok
            if c.passed_gate1:
                passing.append(c)

        pruned = self._prune_by_sasa_then_binding(passing, keep_top)

        decision = GateDecision(
            phase=1,
            gate_id="GATE_1_MASKING",
            passed=len(pruned) > 0,
            candidates_in=len(candidates),
            candidates_out=len(pruned),
            criteria_met={
                "sasa_suppression_>=50pct": sum(1 for c in candidates if c.sasa_suppression_pct >= 50),
                "binding_not_zeroed":       sum(1 for c in candidates if c.masked_binding_score > 0.05),
                "both_criteria":            len(passing),
            },
            action="proceed" if len(pruned) > 0 else "retry_with_modification",
            pruned_ids=[c.candidate_id for c in candidates if c not in pruned],
            notes=f"Top {keep_top} selected by SASA suppression, then masked binding.",
        )

        if not decision.passed:
            raise PipelineTerminated(
                "Gate 1 FAILED: No candidates achieved ≥50% SASA suppression "
                "without permanent binding loss."
            )

        log.info("[CONTROLLER] Gate 1: %d/%d passed → top %d retained",
                 len(passing), len(candidates), len(pruned))
        return pruned, decision

    def _prune_by_sasa_then_binding(
        self, candidates: List[Candidate], k: int
    ) -> List[Candidate]:
        # Primary sort: SASA suppression (descending)
        # Secondary sort: masked binding (descending)
        return sorted(
            candidates,
            key=lambda c: (c.sasa_suppression_pct, c.masked_binding_score),
            reverse=True,
        )[:k]

    # ------------------------------------------------------------------
    # Gate 2 — Linker Timing
    # ------------------------------------------------------------------

    def gate2(
        self,
        candidates: List[Candidate],
        keep_top: int = 5,
        t_half_min_h: float = 1.0,
        t_half_max_h: float = 6.0,
        min_timing_quality: float = 0.45,
    ) -> Tuple[List[Candidate], GateDecision]:
        """
        Keep candidates where:
          • linker_half_life_h ∈ [1–6 h]
          • timing_quality ≥ 0.45 (delayed activation confirmed)
        """
        passing = []
        for c in candidates:
            t_ok = t_half_min_h <= c.linker_half_life_h <= t_half_max_h
            timing_ok = c.timing_quality >= min_timing_quality
            c.passed_gate2 = t_ok and timing_ok
            if c.passed_gate2:
                passing.append(c)

        pruned = sorted(
            passing,
            key=lambda c: (c.timing_quality, c.linker_half_life_h),
            reverse=True,
        )[:keep_top]

        decision = GateDecision(
            phase=2,
            gate_id="GATE_2_TIMING",
            passed=len(pruned) > 0,
            candidates_in=len(candidates),
            candidates_out=len(pruned),
            criteria_met={
                "t_half_in_window": sum(1 for c in candidates
                                        if t_half_min_h <= c.linker_half_life_h <= t_half_max_h),
                "timing_quality_ok": sum(1 for c in candidates if c.timing_quality >= min_timing_quality),
                "both": len(passing),
            },
            action="proceed" if len(pruned) > 0 else "terminate",
            pruned_ids=[c.candidate_id for c in candidates if c not in pruned],
            notes=f"Window: t½ {t_half_min_h}–{t_half_max_h} h, timing_quality ≥ {min_timing_quality}",
        )

        if not decision.passed:
            raise PipelineTerminated(
                "Gate 2 FAILED: No linker configuration achieves t½ ∈ [1–6h] "
                "with confirmed delayed activation."
            )

        log.info("[CONTROLLER] Gate 2: %d/%d passed → top %d retained",
                 len(passing), len(candidates), len(pruned))
        return pruned, decision

    # ------------------------------------------------------------------
    # Gate 3 — Receptor Activation
    # ------------------------------------------------------------------

    def gate3(
        self,
        candidates: List[Candidate],
        keep_top: int = 3,
        min_efficacy_pct: float = 70.0,
        min_unmasked_binding: float = 0.60,
    ) -> Tuple[List[Candidate], GateDecision]:
        """
        Keep candidates where:
          • predicted_efficacy_pct ≥ 70%
          • unmasked_binding_score ≥ 0.60
        """
        passing = []
        for c in candidates:
            eff_ok = c.predicted_efficacy_pct >= min_efficacy_pct
            bind_ok = c.unmasked_binding_score >= min_unmasked_binding
            c.passed_gate3 = eff_ok and bind_ok
            if c.passed_gate3:
                passing.append(c)

        pruned = sorted(
            passing,
            key=lambda c: (c.predicted_efficacy_pct, c.unmasked_binding_score),
            reverse=True,
        )[:keep_top]

        decision = GateDecision(
            phase=3,
            gate_id="GATE_3_ACTIVATION",
            passed=len(pruned) > 0,
            candidates_in=len(candidates),
            candidates_out=len(pruned),
            criteria_met={
                "efficacy_>=70pct":       sum(1 for c in candidates if c.predicted_efficacy_pct >= 70),
                "unmasked_binding_>=0.6": sum(1 for c in candidates if c.unmasked_binding_score >= 0.60),
                "both": len(passing),
            },
            action="proceed" if len(pruned) > 0 else "terminate",
            pruned_ids=[c.candidate_id for c in candidates if c not in pruned],
            notes=f"Efficacy ≥{min_efficacy_pct}%, unmasked binding ≥{min_unmasked_binding}",
        )

        if not decision.passed:
            raise PipelineTerminated(
                "Gate 3 FAILED: No candidate achieves ≥70% receptor activation "
                "post-linker cleavage."
            )

        log.info("[CONTROLLER] Gate 3: %d/%d passed → top %d retained",
                 len(passing), len(candidates), len(pruned))
        return pruned, decision

    # ------------------------------------------------------------------
    # Gate 4 — Temporal PK
    # ------------------------------------------------------------------

    def gate4(
        self,
        candidates: List[Candidate],
    ) -> Tuple[List[Candidate], GateDecision]:
        """
        Keep candidates where:
          • late/early activation ratio ≥ 3× baseline GLP-1 ratio (~1.05)
          → target ratio ≥ 3.15
        """
        threshold = _BASELINE_LATE_EARLY_RATIO * _GATE4_MIN_RATIO_IMPROVEMENT

        passing = []
        for c in candidates:
            c.passed_gate4 = c.late_early_ratio >= threshold
            if c.passed_gate4:
                passing.append(c)

        decision = GateDecision(
            phase=4,
            gate_id="GATE_4_PK_TEMPORAL",
            passed=len(passing) > 0,
            candidates_in=len(candidates),
            candidates_out=len(passing),
            criteria_met={
                "late_early_ratio_>=3x_baseline": sum(
                    1 for c in candidates if c.late_early_ratio >= threshold
                ),
            },
            action="proceed" if len(passing) > 0 else "terminate",
            pruned_ids=[c.candidate_id for c in candidates if c not in passing],
            notes=(
                f"Baseline GLP-1 late/early ratio ≈ {_BASELINE_LATE_EARLY_RATIO:.2f}. "
                f"Required ≥ {threshold:.2f} ({_GATE4_MIN_RATIO_IMPROVEMENT:.0f}× improvement)."
            ),
        )

        if not decision.passed:
            raise PipelineTerminated(
                "Gate 4 FAILED: No candidate shows sufficient temporal separation "
                "of early vs late activation."
            )

        log.info("[CONTROLLER] Gate 4: %d/%d passed", len(passing), len(candidates))
        return passing, decision


class PipelineTerminated(Exception):
    """Raised when a hard gate fails and pipeline cannot continue."""
