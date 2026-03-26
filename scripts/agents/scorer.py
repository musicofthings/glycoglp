"""
Scorer Agent — normalizes all evaluation outputs and applies the
weighted composite scoring function.

Score = 0.30 × masking_score
      + 0.25 × timing_score
      + 0.25 × binding_score
      + 0.20 × stability_score

All component scores are normalized to [0, 1] before weighting.
"""
from __future__ import annotations

import logging
from typing import List, Tuple

import numpy as np

from agents.models import Candidate

log = logging.getLogger(__name__)

# Scoring weights (must sum to 1.0)
WEIGHTS = {
    "masking":   0.30,
    "timing":    0.25,
    "binding":   0.25,
    "stability": 0.20,
}

# Normalization bounds (from expected ranges across the candidate space)
_NORM = {
    "sasa_suppression_pct":    (0.0,   95.0),
    "timing_quality":          (0.0,    1.0),
    "unmasked_binding_score":  (0.4,    1.35),
    "stability_score":         (0.3,    0.99),
}


def _normalize(value: float, lo: float, hi: float) -> float:
    """Min-max normalization; clamp to [0, 1]."""
    if hi == lo:
        return 0.0
    return float(np.clip((value - lo) / (hi - lo), 0.0, 1.0))


class ScorerAgent:
    """
    Applies the weighted scoring function to a list of evaluated candidates.
    Populates all score fields and assigns ranks (1 = best).
    """

    def score(self, candidates: List[Candidate]) -> List[Candidate]:
        """Compute final scores and rank all candidates in-place."""
        self._populate_component_scores(candidates)
        self._rank(candidates)
        log.info("[SCORER] Scored %d candidates", len(candidates))
        return candidates

    def _populate_component_scores(self, candidates: List[Candidate]) -> None:
        for cand in candidates:
            cand.masking_score = _normalize(
                cand.sasa_suppression_pct, *_NORM["sasa_suppression_pct"]
            )
            cand.timing_score = _normalize(
                cand.timing_quality, *_NORM["timing_quality"]
            )
            cand.binding_score = _normalize(
                cand.unmasked_binding_score, *_NORM["unmasked_binding_score"]
            )
            cand.stability_score = _normalize(
                cand.stability_score, *_NORM["stability_score"]
            )

            cand.final_score = (
                WEIGHTS["masking"]   * cand.masking_score
                + WEIGHTS["timing"]    * cand.timing_score
                + WEIGHTS["binding"]   * cand.binding_score
                + WEIGHTS["stability"] * cand.stability_score
            )

    def _rank(self, candidates: List[Candidate]) -> None:
        sorted_cands = sorted(candidates, key=lambda c: c.final_score, reverse=True)
        for rank, cand in enumerate(sorted_cands, start=1):
            cand.rank = rank

    def leaderboard(self, candidates: List[Candidate], top_n: int = 10) -> List[dict]:
        """Return a compact leaderboard dict for logging / display."""
        ranked = sorted(candidates, key=lambda c: c.final_score, reverse=True)[:top_n]
        return [
            {
                "rank":            c.rank,
                "id":              c.candidate_id,
                "glycan":          c.glycan_type,
                "linker":          c.linker_type,
                "sasa_supp_pct":   round(c.sasa_suppression_pct, 1),
                "t_half_h":        round(c.linker_half_life_h, 2),
                "efficacy_pct":    round(c.predicted_efficacy_pct, 1),
                "stability":       round(c.stability_score, 3),
                "final_score":     round(c.final_score, 4),
            }
            for c in ranked
        ]

    def score_breakdown(self, candidate: Candidate) -> dict:
        """Detailed score breakdown for a single candidate."""
        return {
            "candidate_id":   candidate.candidate_id,
            "components": {
                "masking_score":   {
                    "raw": round(candidate.sasa_suppression_pct, 2),
                    "normalized": round(candidate.masking_score, 4),
                    "weighted": round(WEIGHTS["masking"] * candidate.masking_score, 4),
                },
                "timing_score":    {
                    "raw": round(candidate.timing_quality, 4),
                    "normalized": round(candidate.timing_score, 4),
                    "weighted": round(WEIGHTS["timing"] * candidate.timing_score, 4),
                },
                "binding_score":   {
                    "raw": round(candidate.unmasked_binding_score, 4),
                    "normalized": round(candidate.binding_score, 4),
                    "weighted": round(WEIGHTS["binding"] * candidate.binding_score, 4),
                },
                "stability_score": {
                    "raw": round(candidate.stability_score, 4),
                    "normalized": round(candidate.stability_score, 4),
                    "weighted": round(WEIGHTS["stability"] * candidate.stability_score, 4),
                },
            },
            "final_score": round(candidate.final_score, 4),
            "rank": candidate.rank,
        }
