"""
PDB Builder — generates idealized PDB structures for top GLP-1 glycoconjugate
candidates, suitable for loading into the Mol* viewer.

Each structure contains:
  • GLP-1(7-36) backbone in idealized α-helical geometry
  • Mutated residues correctly labelled
  • Glycan residues (NAG, MAN, SIA, GAL) anchored at the attachment site
  • Linker represented as a hetero-residue (LNK)
  • SEQRES and REMARK records for annotation
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import List, Dict, Tuple, Optional

_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))

from agents.models import GLP1_SEQUENCE, GLYCAN_CATALOG

# ------------------------------------------------------------------
# Standard amino acid 3-letter code mapping
# ------------------------------------------------------------------
_AA1_TO_3: Dict[str, str] = {
    "A": "ALA", "R": "ARG", "N": "ASN", "D": "ASP", "C": "CYS",
    "E": "GLU", "Q": "GLN", "G": "GLY", "H": "HIS", "I": "ILE",
    "L": "LEU", "K": "LYS", "M": "MET", "F": "PHE", "P": "PRO",
    "S": "SER", "T": "THR", "W": "TRP", "Y": "TYR", "V": "VAL",
    "B": "AIB",  # Aib placeholder
}

# GLP-1 canonical residue numbers start at 7
_GLP1_OFFSET = 7

# Glycan residues in order of attachment for each glycan type
# (residue name, C1 approximate offset from anchor in Å)
_GLYCAN_RESIDUES: Dict[str, List[Tuple[str, float, float, float]]] = {
    "monosaccharide_GlcNAc2": [
        ("NAG", 0.0,  3.0, 1.5),
        ("NAG", 0.0,  5.5, 2.5),
    ],
    "biantennary_core": [
        ("NAG", 0.0,  3.0, 1.5),
        ("NAG", 0.0,  5.5, 2.5),
        ("MAN", 0.0,  8.0, 2.0),
        ("MAN", -2.5, 10.0, 3.0),
        ("MAN",  2.5, 10.0, 3.0),
        ("MAN", -4.5, 12.0, 4.0),
        ("MAN",  4.5, 12.0, 4.0),
    ],
    "biantennary_sialylated": [
        ("NAG", 0.0,  3.0, 1.5),
        ("NAG", 0.0,  5.5, 2.5),
        ("MAN", 0.0,  8.0, 2.0),
        ("MAN", -2.5, 10.0, 3.0),
        ("MAN",  2.5, 10.0, 3.0),
        ("GAL", -4.5, 12.0, 4.0),
        ("GAL",  4.5, 12.0, 4.0),
        ("SIA", -6.0, 14.5, 5.0),
        ("SIA",  6.0, 14.5, 5.0),
        ("GAL", -4.5, 16.5, 4.5),
        ("GAL",  4.5, 16.5, 4.5),
    ],
    "core1_o_linked": [
        ("NAG", 0.0, 3.0, 1.5),
        ("GAL", 0.0, 5.5, 2.5),
    ],
}

# Linker residue name by linker type
_LINKER_RESNAME: Dict[str, str] = {
    "PABC_ester":          "PAB",
    "ester_simple":        "EST",
    "carbonate":           "CAR",
    "disulfide":           "DSS",
    "cathepsin_GFLG":      "GFL",
    "pH_sensitive_hydrazone": "HYD",
}


def _helix_ca(res_index: int, offset_x: float = 0.0, offset_y: float = 0.0) -> Tuple[float, float, float]:
    """
    Return the Cα coordinate for residue at 0-indexed position along an ideal α-helix.
      pitch  = 1.5 Å / residue
      radius = 2.3 Å
      3.6 residues / turn  →  100° per residue
    """
    angle = math.radians(100.0 * res_index)
    x = 2.3 * math.cos(angle) + offset_x
    y = 2.3 * math.sin(angle) + offset_y
    z = 1.5 * res_index
    return (round(x, 3), round(y, 3), round(z, 3))


def _backbone_atoms(ca: Tuple[float, float, float]) -> Dict[str, Tuple[float, float, float]]:
    """Approximate N, CA, C, O positions around a Cα."""
    x, y, z = ca
    return {
        "N":  (round(x - 1.46, 3), round(y + 0.2, 3), round(z - 0.5, 3)),
        "CA": ca,
        "C":  (round(x + 1.52, 3), round(y - 0.1, 3), round(z + 0.3, 3)),
        "O":  (round(x + 2.10, 3), round(y + 0.8, 3), round(z + 0.9, 3)),
    }


def _format_atom(
    serial: int,
    name: str,
    resname: str,
    chain: str,
    resseq: int,
    x: float, y: float, z: float,
    bfactor: float = 20.0,
    element: str = "C",
    hetatm: bool = False,
) -> str:
    record = "HETATM" if hetatm else "ATOM  "
    # PDB ATOM record format (strict 80-char)
    return (
        f"{record}{serial:5d} {name:<4s} {resname:<3s} {chain}{resseq:4d}    "
        f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00{bfactor:6.2f}          {element:>2s}  "
    )


def build_pdb(
    candidate_id: str,
    sequence: str,
    glycan_type: str,
    glycan_position: int,       # local 1-indexed
    linker_type: str,
    mutations: List[dict],
    output_path: Path,
) -> None:
    """
    Build and write a PDB file for one candidate.
    """
    lines: List[str] = []
    serial = 1

    # --- HEADER / REMARKS -------------------------------------------
    lines.append(f"HEADER    GLP-1 GLYCOCONJUGATE  GLYCO-MASKING PROGRAM")
    lines.append(f"TITLE     {candidate_id}")
    lines.append(f"REMARK  1 GLP-1(7-36) GLYCO-MASKED ANALOG")
    lines.append(f"REMARK  2 GLYCAN: {glycan_type} @ LOCAL POS {glycan_position} "
                 f"(CANONICAL POS {glycan_position + _GLP1_OFFSET - 1})")
    lines.append(f"REMARK  3 LINKER: {linker_type}")
    mut_str = ", ".join(
        f"{m.get('from','?')}{m.get('position', 0) + _GLP1_OFFSET - 1}{m.get('to','?')}"
        for m in mutations
    )
    lines.append(f"REMARK  4 MUTATIONS: {mut_str if mut_str else 'NONE'}")
    lines.append(f"REMARK  5 IN SILICO GENERATED — NOT EXPERIMENTALLY VALIDATED")

    # --- SEQRES -------------------------------------------------------
    res3 = [_AA1_TO_3.get(aa, "UNK") for aa in sequence]
    for chunk_start in range(0, len(res3), 13):
        chunk = res3[chunk_start:chunk_start + 13]
        lines.append(
            f"SEQRES {chunk_start // 13 + 1:3d} A {len(sequence):4d}  " +
            " ".join(chunk)
        )

    # --- PROTEIN CHAIN (backbone only for clarity) --------------------
    chain = "A"
    for i, aa in enumerate(sequence):
        resname = _AA1_TO_3.get(aa, "UNK")
        resseq = i + _GLP1_OFFSET          # canonical GLP-1 numbering
        ca = _helix_ca(i)
        atoms = _backbone_atoms(ca)
        bfactor = 15.0 if i < 8 else 20.0  # lower B for activation domain

        for atom_name, (ax, ay, az) in atoms.items():
            elem = atom_name[0]
            lines.append(_format_atom(serial, atom_name, resname, chain, resseq,
                                      ax, ay, az, bfactor, elem, hetatm=False))
            serial += 1

    lines.append("TER")

    # --- LINKER (hetero chain B) -------------------------------------
    linker_resname = _LINKER_RESNAME.get(linker_type, "LNK")
    # Anchor: Cβ direction from Cα of glycan-bearing residue
    attach_idx = glycan_position - 1
    ca_attach = _helix_ca(attach_idx)
    angle_attach = math.radians(100.0 * attach_idx)

    # Linker extends radially outward from helix
    lnk_x = ca_attach[0] + 3.5 * math.cos(angle_attach)
    lnk_y = ca_attach[1] + 3.5 * math.sin(angle_attach)
    lnk_z = ca_attach[2]

    lines.append(_format_atom(serial, "C1 ", linker_resname, "B", 901,
                               round(lnk_x, 3), round(lnk_y, 3), round(lnk_z, 3),
                               25.0, "C", hetatm=True))
    serial += 1
    lines.append(_format_atom(serial, "C2 ", linker_resname, "B", 901,
                               round(lnk_x + 1.5, 3), round(lnk_y, 3), round(lnk_z + 0.5, 3),
                               25.0, "C", hetatm=True))
    serial += 1
    lines.append(_format_atom(serial, "O1 ", linker_resname, "B", 901,
                               round(lnk_x + 0.7, 3), round(lnk_y + 1.2, 3), round(lnk_z, 3),
                               25.0, "O", hetatm=True))
    serial += 1

    # --- GLYCAN (hetero chain C) ------------------------------------
    glycan_residues = _GLYCAN_RESIDUES.get(glycan_type, [])

    # Glycan base: further out radially from linker
    base_x = ca_attach[0] + 6.0 * math.cos(angle_attach)
    base_y = ca_attach[1] + 6.0 * math.sin(angle_attach)
    base_z = ca_attach[2]

    for g_idx, (gres, dx, dz_offset, spread) in enumerate(glycan_residues):
        gx = round(base_x + dx + spread * math.cos(math.radians(30 * g_idx)), 3)
        gy = round(base_y + dx + spread * math.sin(math.radians(30 * g_idx)), 3)
        gz = round(base_z + dz_offset, 3)
        gseq = 501 + g_idx
        lines.append(_format_atom(serial, "C1 ", gres, "C", gseq,
                                   gx, gy, gz, 30.0, "C", hetatm=True))
        serial += 1
        # Add a few extra atoms for visual representation
        lines.append(_format_atom(serial, "O1 ", gres, "C", gseq,
                                   round(gx + 1.2, 3), round(gy + 0.3, 3), round(gz + 0.4, 3),
                                   30.0, "O", hetatm=True))
        serial += 1
        lines.append(_format_atom(serial, "C2 ", gres, "C", gseq,
                                   round(gx + 1.5, 3), round(gy - 0.5, 3), round(gz - 0.3, 3),
                                   30.0, "C", hetatm=True))
        serial += 1

    lines.append("END")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Written: {output_path}")


def build_all_from_report(report_path: Path, output_dir: Path) -> List[str]:
    """
    Build PDB files for all top candidates from final_report.json.
    Returns list of candidate IDs written.
    """
    with open(report_path) as f:
        report = json.load(f)

    written = []
    for cand in report["top_candidates"]:
        cid = cand["candidate_id"]
        # Safe filename
        fname = cid.lower().replace("-", "_") + ".pdb"
        out = output_dir / fname
        build_pdb(
            candidate_id=cid,
            sequence=cand["sequence"],
            glycan_type=cand["glycan_type"],
            glycan_position=int(cand["glycan_position"].split()[1]),
            linker_type=cand["linker_type"],
            mutations=cand["key_mutations"],
            output_path=out,
        )
        written.append(cid)

    # Also build unmodified GLP-1 reference
    ref_out = output_dir / "glp1_reference.pdb"
    build_pdb(
        candidate_id="GLP1-REFERENCE",
        sequence=GLP1_SEQUENCE,
        glycan_type="",
        glycan_position=2,
        linker_type="",
        mutations=[],
        output_path=ref_out,
    )
    written.append("GLP1-REFERENCE")

    return written


if __name__ == "__main__":
    _REPO = Path(__file__).parent.parent
    report = _REPO / "scripts" / "results" / "final_report.json"
    out_dir = _REPO / "public" / "structures"

    ids = build_all_from_report(report, out_dir)
    print(f"\nBuilt {len(ids)} PDB structures: {ids}")
