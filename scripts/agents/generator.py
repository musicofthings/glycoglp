"""
Generator Agent — creates GLP-1 glycoconjugate candidates.

Capabilities:
  • GLP-1(7-36) sequence modification
  • Glycan attachment at positions 2/3 (local numbering)
  • Linker variation
  • Residue mutations at positions 13–22
  • RDKit SMILES validation for linker scaffolds

All outputs are structured Candidate objects.
"""
from __future__ import annotations

import hashlib
import itertools
import logging
import math
from typing import List, Optional

from rdkit import Chem
from rdkit.Chem import Descriptors

from agents.models import (
    AA_MW,
    GLYCAN_CATALOG,
    LINKER_CATALOG,
    MUTATION_CATALOG,
    GLP1_SEQUENCE,
    Candidate,
    Modification,
)

log = logging.getLogger(__name__)

# Positions in the GLP-1(7-36) local numbering (1-indexed)
# where glycan O/N-attachment is feasible via side-chain engineering
GLYCAN_ATTACHMENT_POSITIONS = [2, 3]   # Ala2→Thr2 (O-linked) or Glu3→Asn3 (N-linked)

# Positions that support each glycan linkage type
_O_LINK_POSITIONS = {2, 3}    # Ser/Thr → O-linked
_N_LINK_POSITIONS = {3}       # Asn-X-Ser/Thr sequon at pos 3 (Glu3→Asn3, pos5=Thr)


def _peptide_mw(sequence: str) -> float:
    """Monoisotopic MW of a peptide (sum of residue MW + water)."""
    return sum(AA_MW.get(aa, 111.1) for aa in sequence) + 18.02


def _make_candidate_id(glycan: str, pos: int, linker: str,
                       mutations: list, variant: int = 0) -> str:
    tag = f"{glycan[:4]}_{pos}_{linker[:4]}_{'-'.join(str(m) for m in mutations)}_{variant}"
    h = hashlib.md5(tag.encode()).hexdigest()[:6].upper()
    return f"GLP1-GM-{h}"


def _validate_smiles(smiles: str) -> bool:
    try:
        mol = Chem.MolFromSmiles(smiles)
        return mol is not None
    except Exception:
        return False


def _apply_mutations(sequence: str, mutations: List[dict]) -> str:
    seq_list = list(sequence)
    for m in mutations:
        pos = m["position"]   # 1-indexed local
        idx = pos - 1
        if 0 <= idx < len(seq_list):
            seq_list[idx] = m["to"]
    return "".join(seq_list)


def _estimate_total_mw(sequence: str, glycan_type: str, linker_type: str) -> float:
    pep_mw = _peptide_mw(sequence)
    glycan_mw = GLYCAN_CATALOG.get(glycan_type, {}).get("mw", 0.0)
    linker_mw = 0.0
    if linker_type:
        smi = LINKER_CATALOG.get(linker_type, {}).get("smiles", "")
        if smi and _validate_smiles(smi):
            mol = Chem.MolFromSmiles(smi)
            linker_mw = Descriptors.ExactMolWt(mol)
    return pep_mw + glycan_mw + linker_mw


class GeneratorAgent:
    """
    Generates molecular candidates according to the pipeline phase.

    Phase 1 → 50 glycoconjugate variants
    Phase 2 → linker variants for surviving candidates
    Phase 3 → mutation variants for surviving candidates
    """

    # ------------------------------------------------------------------
    # Phase 1 – 50 glycoconjugate candidates
    # ------------------------------------------------------------------

    def generate_phase1(self, limit: int = 50) -> List[Candidate]:
        """
        Enumerate glycan × position × backbone variations.

        Strategy:
          4 glycan types × 2 positions × 6 backbone variants = 48 + 2 extended = 50
        """
        candidates: List[Candidate] = []
        backbone_variants = self._backbone_variants()

        combos = list(itertools.product(
            GLYCAN_CATALOG.keys(),           # 4 glycan types
            GLYCAN_ATTACHMENT_POSITIONS,     # positions 2, 3
        ))

        idx = 0
        for glycan_type, glycan_pos in combos:
            for backbone in backbone_variants:
                if idx >= limit:
                    break
                cand = self._build_phase1_candidate(
                    glycan_type=glycan_type,
                    glycan_pos=glycan_pos,
                    backbone=backbone,
                    variant_index=idx,
                )
                candidates.append(cand)
                idx += 1
            if idx >= limit:
                break

        # Pad to exactly `limit` if needed (additional sialylated variants)
        while len(candidates) < limit:
            extra = self._build_phase1_candidate(
                glycan_type="biantennary_sialylated",
                glycan_pos=2,
                backbone=backbone_variants[len(candidates) % len(backbone_variants)],
                variant_index=len(candidates),
            )
            candidates.append(extra)

        log.info("[GENERATOR] Phase 1: generated %d candidates", len(candidates))
        return candidates[:limit]

    def _backbone_variants(self) -> list:
        """
        6 backbone modifications:
          0 – native GLP-1(7-36) unmodified
          1 – A8T (enables O-glycosylation at pos 2)
          2 – A8T + S18A (DPP-4 resistance)
          3 – A8T + E9N (creates N-X-T sequon for N-glycosylation at pos 3)
          4 – A8T + S18A + E21Q (dual modification)
          5 – Cα-methylated Aib at pos 8 (DPP-4 resistant, helix stabilizing)
        """
        return [
            {"id": "native",    "mutations": []},
            {"id": "A8T",       "mutations": [{"position": 2, "from": "A", "to": "T"}]},
            {"id": "A8T_S18A",  "mutations": [{"position": 2, "from": "A", "to": "T"},
                                               {"position": 12, "from": "S", "to": "A"}]},
            {"id": "A8T_E9N",   "mutations": [{"position": 2, "from": "A", "to": "T"},
                                               {"position": 3, "from": "E", "to": "N"}]},
            {"id": "A8T_S18A_E21Q", "mutations": [
                {"position": 2, "from": "A", "to": "T"},
                {"position": 12, "from": "S", "to": "A"},
                {"position": 15, "from": "E", "to": "Q"}]},
            {"id": "Aib8",      "mutations": [{"position": 2, "from": "A", "to": "B"}]},
            # B = Aib placeholder (α-aminoisobutyric acid)
        ]

    def _build_phase1_candidate(
        self,
        glycan_type: str,
        glycan_pos: int,
        backbone: dict,
        variant_index: int,
    ) -> Candidate:
        muts = backbone["mutations"]
        seq = _apply_mutations(GLP1_SEQUENCE, muts)

        glycan_info = GLYCAN_CATALOG[glycan_type]
        linkage = glycan_info["linkage"]

        mods = []
        for m in muts:
            mods.append(Modification(
                type="mutation",
                position=m["position"],
                detail=f"{m['from']}{m['position'] + 6}{m['to']}",  # canonical numbering
            ))
        mods.append(Modification(
            type="glycan",
            position=glycan_pos,
            detail=f"{glycan_type} ({linkage}) at pos {glycan_pos + 6}",
        ))

        cid = _make_candidate_id(glycan_type, glycan_pos, "", muts, variant_index)
        mw = _estimate_total_mw(seq, glycan_type, "")

        return Candidate(
            candidate_id=cid,
            phase_generated=1,
            sequence=seq,
            modifications=mods,
            glycan_type=glycan_type,
            glycan_position=glycan_pos,
            linker_type="",
            mutations=muts,
            estimated_mw_da=mw,
            synthesis_notes=f"Backbone: {backbone['id']}; "
                            f"Glycan: {glycan_info['description']}; "
                            f"Attach: pos {glycan_pos + 6} ({linkage})",
        )

    # ------------------------------------------------------------------
    # Phase 2 – linker variants for top candidates from Phase 1
    # ------------------------------------------------------------------

    def generate_phase2(
        self,
        candidates: List[Candidate],
        linker_limit: int = 20,
    ) -> List[Candidate]:
        """
        For each Phase 1 survivor, attach each linker type.
        Returns up to `linker_limit` new candidate objects.
        """
        new_candidates: List[Candidate] = []
        linkers = list(LINKER_CATALOG.keys())

        for cand in candidates:
            for linker_type in linkers:
                if len(new_candidates) >= linker_limit:
                    break
                new_cand = self._attach_linker(cand, linker_type)
                new_candidates.append(new_cand)
            if len(new_candidates) >= linker_limit:
                break

        log.info("[GENERATOR] Phase 2: generated %d linker-attached candidates",
                 len(new_candidates))
        return new_candidates

    def _attach_linker(self, base: Candidate, linker_type: str) -> Candidate:
        linker_info = LINKER_CATALOG[linker_type]
        new_id = _make_candidate_id(
            base.glycan_type, base.glycan_position,
            linker_type, base.mutations
        )

        mods = list(base.modifications)
        mods.append(Modification(
            type="linker",
            position=base.glycan_position,
            detail=linker_info["name"],
            smiles=linker_info["smiles"],
        ))

        mw = _estimate_total_mw(base.sequence, base.glycan_type, linker_type)

        import copy
        new_cand = copy.deepcopy(base)
        new_cand.candidate_id = new_id
        new_cand.phase_generated = 2
        new_cand.linker_type = linker_type
        new_cand.modifications = mods
        new_cand.estimated_mw_da = mw
        new_cand.synthesis_notes += f"; Linker: {linker_info['name']}"
        return new_cand

    # ------------------------------------------------------------------
    # Phase 3 – mutation optimization at positions 13–22
    # ------------------------------------------------------------------

    def generate_phase3(
        self,
        candidates: List[Candidate],
        mutation_limit: int = 50,
    ) -> List[Candidate]:
        """
        Apply single and double mutations at positions 13–22 to optimize
        receptor activation post-cleavage.
        Returns up to `mutation_limit` new variants.
        """
        new_candidates: List[Candidate] = []

        # Generate all single mutations from catalog
        single_muts = []
        for pos, options in MUTATION_CATALOG.items():
            for wt, mut, rationale in options:
                single_muts.append({"position": pos, "from": wt, "to": mut, "rationale": rationale})

        # Generate selected double mutations (biologically motivated combinations)
        double_muts = [
            [{"position": 18, "from": "S", "to": "A"}, {"position": 22, "from": "G", "to": "A"}],
            [{"position": 19, "from": "Y", "to": "F"}, {"position": 21, "from": "E", "to": "Q"}],
            [{"position": 17, "from": "S", "to": "T"}, {"position": 20, "from": "L", "to": "I"}],
            [{"position": 13, "from": "T", "to": "S"}, {"position": 18, "from": "S", "to": "A"}],
            [{"position": 19, "from": "Y", "to": "W"}, {"position": 22, "from": "G", "to": "A"}],
        ]

        all_mutation_sets = [[m] for m in single_muts] + double_muts

        for cand in candidates:
            for mut_set in all_mutation_sets:
                if len(new_candidates) >= mutation_limit:
                    break
                new_cand = self._apply_phase3_mutations(cand, mut_set)
                new_candidates.append(new_cand)
            if len(new_candidates) >= mutation_limit:
                break

        log.info("[GENERATOR] Phase 3: generated %d mutation-optimized candidates",
                 len(new_candidates))
        return new_candidates

    def _apply_phase3_mutations(
        self, base: Candidate, new_mutations: List[dict]
    ) -> Candidate:
        combined_muts = list(base.mutations) + new_mutations
        new_seq = _apply_mutations(base.sequence, combined_muts)

        mods = list(base.modifications)
        for m in new_mutations:
            mods.append(Modification(
                type="mutation",
                position=m["position"],
                detail=f"{m['from']}{m['position'] + 6}{m['to']} — {m.get('rationale', '')}",
            ))

        new_id = _make_candidate_id(
            base.glycan_type, base.glycan_position,
            base.linker_type, combined_muts
        )

        import copy
        new_cand = copy.deepcopy(base)
        new_cand.candidate_id = new_id
        new_cand.phase_generated = 3
        new_cand.sequence = new_seq
        new_cand.modifications = mods
        new_cand.mutations = combined_muts
        new_cand.estimated_mw_da = _peptide_mw(new_seq) + \
            GLYCAN_CATALOG.get(base.glycan_type, {}).get("mw", 0)
        new_cand.synthesis_notes += (
            "; Mutations: " + ", ".join(
                f"{m['from']}{m['position'] + 6}{m['to']}" for m in new_mutations
            )
        )
        return new_cand
