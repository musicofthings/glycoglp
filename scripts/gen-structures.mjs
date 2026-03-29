/**
 * gen-structures.mjs
 * Generates proper PDB files with realistic molecular geometry for the GlycoGLP project.
 * Run: node scripts/gen-structures.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'structures');

// ── Helpers ──────────────────────────────────────────────────────────────────

function deg2rad(d) { return d * Math.PI / 180; }

/** Right-pad or truncate a string to exactly n chars */
function pad(s, n) { return String(s).padEnd(n).slice(0, n); }

/** Left-pad a string/number to exactly n chars */
function lpad(s, n) { return String(s).padStart(n).slice(-n); }

/** Format float to fixed decimals then left-pad to width */
function fmt(v, width, dec) { return lpad(v.toFixed(dec), width); }

/**
 * Build one PDB ATOM/HETATM line (exactly 80 chars).
 * PDB column spec (1-based):
 *  1-6   record name
 *  7-11  serial
 *  12    space
 *  13-16 atom name (left-justified if 4-char element, else column 14)
 *  17    alt loc (space)
 *  18-20 residue name
 *  21    space
 *  22    chain ID
 *  23-26 res seq
 *  27    insertion code (space)
 *  28-30 spaces
 *  31-38 x (8.3f)
 *  39-46 y (8.3f)
 *  47-54 z (8.3f)
 *  55-60 occupancy (6.2f)
 *  61-66 B-factor (6.2f)
 *  67-76 spaces
 *  77-78 element (right-justified in 2 chars)
 *  79-80 charge (spaces)
 */
function atomLine(record, serial, atomName, resName, chain, resSeq, x, y, z, occ = 1.00, bfac = 20.00, elem = '') {
  // Atom name field (cols 13-16): 4-char element names start at col 13; others start at col 14
  let aname;
  const atomTrim = atomName.trim();
  if (atomTrim.length >= 4 || atomTrim[0] === 'H') {
    aname = pad(atomTrim, 4);
  } else {
    aname = ' ' + pad(atomTrim, 3);
  }

  const el = elem || atomTrim.replace(/[0-9]/g, '')[0] || 'X';
  const elFmt = lpad(el, 2);

  const rec   = pad(record, 6);
  const ser   = lpad(serial, 5);
  const rname = pad(resName, 3);
  const ch    = String(chain)[0];
  const rseq  = lpad(resSeq, 4);
  const xs    = fmt(x, 8, 3);
  const ys    = fmt(y, 8, 3);
  const zs    = fmt(z, 8, 3);
  const occS  = fmt(occ, 6, 2);
  const bfacS = fmt(bfac, 6, 2);

  // Build exactly 80 chars:
  // cols  1- 6: record (6)
  // cols  7-11: serial (5)
  // col  12: space (1)
  // cols 13-16: aname (4)
  // col  17: alt loc space (1)
  // cols 18-20: resName (3)
  // col  21: space (1)
  // col  22: chain (1)
  // cols 23-26: resSeq (4)
  // col  27: iCode space (1)
  // cols 28-30: spaces (3)
  // cols 31-38: x (8)
  // cols 39-46: y (8)
  // cols 47-54: z (8)
  // cols 55-60: occ (6)
  // cols 61-66: bfac (6)
  // cols 67-76: spaces (10)
  // cols 77-78: element (2)
  // cols 79-80: charge (2)

  const line = rec + ser + ' ' + aname + ' ' + rname + ' ' + ch + rseq + ' ' + '   ' + xs + ys + zs + occS + bfacS + '          ' + elFmt + '  ';
  // Ensure exactly 80 chars
  return line.padEnd(80).slice(0, 80);
}

// ── Secondary-structure & connectivity records ────────────────────────────────

/**
 * Build a PDB HELIX record (80 chars).
 * helixClass: 1 = right-handed alpha
 */
function helixRecord(serNum, helixID, initResName, initChainID, initSeqNum,
                     endResName, endChainID, endSeqNum, helixClass, length) {
  let line = '';
  line += 'HELIX ';               // cols  1- 6
  line += ' ';                    // col   7
  line += lpad(serNum, 3);        // cols  8-10
  line += ' ';                    // col  11
  line += lpad(helixID, 3);       // cols 12-14
  line += ' ';                    // col  15
  line += pad(initResName, 3);    // cols 16-18
  line += ' ';                    // col  19
  line += initChainID;            // col  20
  line += ' ';                    // col  21
  line += lpad(initSeqNum, 4);    // cols 22-25
  line += ' ';                    // col  26 (iCode)
  line += ' ';                    // col  27
  line += pad(endResName, 3);     // cols 28-30
  line += ' ';                    // col  31
  line += endChainID;             // col  32
  line += ' ';                    // col  33
  line += lpad(endSeqNum, 4);     // cols 34-37
  line += ' ';                    // col  38 (iCode)
  line += lpad(helixClass, 2);    // cols 39-40
  line += ' '.repeat(30);         // cols 41-70 (comment)
  line += ' ';                    // col  71
  line += lpad(length, 5);        // cols 72-76
  return line.padEnd(80);
}

/**
 * Build a PDB LINK record (80 chars).
 * Defines a covalent inter-residue bond — these go BEFORE ATOM records.
 * Molstar uses LINK records (converted to struct_conn) for carbohydrate
 * topology detection; CONECT alone is not sufficient.
 *
 * PDB LINK column spec (1-based):
 *   1- 6  "LINK  "
 *   7-12  spaces
 *  13-16  atom name 1
 *  17     altLoc1
 *  18-20  resName1
 *  22     chainID1
 *  23-26  resSeq1
 *  27     iCode1
 *  28-42  spaces
 *  43-46  atom name 2
 *  47     altLoc2
 *  48-50  resName2
 *  52     chainID2
 *  53-56  resSeq2
 *  57     iCode2
 *  58-59  spaces
 *  60-65  sym1
 *  67-72  sym2
 *  74-78  dist
 */
function linkRecord(atomName1, resName1, chain1, resSeq1,
                    atomName2, resName2, chain2, resSeq2,
                    dist = 1.41) {
  function fmtName(n) {
    const t = n.trim();
    return t.length >= 4 ? pad(t, 4) : (' ' + pad(t, 3));
  }
  let line = '';
  line += 'LINK  ';                    // cols  1- 6
  line += '      ';                    // cols  7-12
  line += fmtName(atomName1);          // cols 13-16
  line += ' ';                         // col  17 altLoc
  line += pad(resName1, 3);            // cols 18-20
  line += ' ';                         // col  21
  line += String(chain1)[0];           // col  22
  line += lpad(resSeq1, 4);            // cols 23-26
  line += ' ';                         // col  27 iCode
  line += ' '.repeat(15);              // cols 28-42
  line += fmtName(atomName2);          // cols 43-46
  line += ' ';                         // col  47 altLoc
  line += pad(resName2, 3);            // cols 48-50
  line += ' ';                         // col  51
  line += String(chain2)[0];           // col  52
  line += lpad(resSeq2, 4);            // cols 53-56
  line += ' ';                         // col  57 iCode
  line += '  ';                        // cols 58-59
  line += '  1555';                    // cols 60-65 sym1
  line += ' ';                         // col  66
  line += '  1555';                    // cols 67-72 sym2
  line += ' ';                         // col  73
  line += lpad(dist.toFixed(2), 5);    // cols 74-78
  return line.padEnd(80).slice(0, 80);
}

// ── Alpha Helix Geometry ──────────────────────────────────────────────────────

/**
 * Generate backbone + CB atoms for one residue of a right-handed alpha helix.
 * i = 0-based residue index
 * r = 2.26 Å (Cα radius), ω = 100°/residue, h = 1.5 Å/residue rise
 */
function helixResidue(i, isGly = false) {
  const r     = 2.26;            // Cα helix radius (Å)
  const omega = deg2rad(100);    // rotation per residue
  const h     = 1.5;             // rise per residue (Å)
  const phi   = i * omega;

  // Helix rises along Y so the long axis is vertical in Molstar's default
  // camera view (which looks along −Z).  Cα rotates in the XZ plane.
  //
  // Local frame:
  //   eᵣ = (cos φ, 0, sin φ)  — radial (XZ plane)
  //   eₜ = (−sin φ, 0, cos φ) — tangential
  //   eᵧ = (0, 1, 0)          — axial (rise)
  //
  // World coords from local (dr, dt, dy):
  //   worldX = dr·cos φ − dt·sin φ
  //   worldY = dy
  //   worldZ = dr·sin φ + dt·cos φ

  // Cα
  const caX = r * Math.cos(phi);
  const caY = i * h;
  const caZ = r * Math.sin(phi);

  // N — 1.46 Å, backward-inward: (−0.5·eᵣ − 0.7·eₜ − 0.6·eᵧ)
  const nScale = 1.46 / Math.sqrt(0.5*0.5 + 0.7*0.7 + 0.6*0.6);
  const nX = caX + (-0.5 * Math.cos(phi) + 0.7 * Math.sin(phi)) * nScale;
  const nY = caY + (-0.6) * nScale;
  const nZ = caZ + (-0.5 * Math.sin(phi) - 0.7 * Math.cos(phi)) * nScale;

  // C — 1.52 Å, forward+rise: (0·eᵣ + 0.8·eₜ + 0.6·eᵧ), |(0,0.8,0.6)|=1
  const cX = caX + (-0.8 * Math.sin(phi)) * 1.52;
  const cY = caY + 0.6 * 1.52;
  const cZ = caZ + ( 0.8 * Math.cos(phi)) * 1.52;

  // O — 1.23 Å, direction (0.950·eᵣ − 0.314·eᵧ): radially outward + slight
  // downward tilt.  This makes the projected guide have zero axial component
  // → ribbon-normal ⊥ helix axis → flat RCSB-style ribbon.
  const oX = cX + 0.950 * Math.cos(phi) * 1.23;
  const oY = cY - 0.314 * 1.23;
  const oZ = cZ + 0.950 * Math.sin(phi) * 1.23;

  const atoms = [
    { name: 'N',  x: nX,  y: nY,  z: nZ,  elem: 'N' },
    { name: 'CA', x: caX, y: caY, z: caZ, elem: 'C' },
    { name: 'C',  x: cX,  y: cY,  z: cZ,  elem: 'C' },
    { name: 'O',  x: oX,  y: oY,  z: oZ,  elem: 'O' },
  ];

  if (!isGly) {
    // CB — 1.52 Å, inward+rise: (−0.9·eᵣ + 0.8·eᵧ), scale = 1.52/√1.45
    const cbScale = 1.52 / Math.sqrt(0.9*0.9 + 0.8*0.8);
    const cbX = caX + (-0.9 * Math.cos(phi)) * cbScale;
    const cbY = caY + 0.8 * cbScale;
    const cbZ = caZ + (-0.9 * Math.sin(phi)) * cbScale;
    atoms.push({ name: 'CB', x: cbX, y: cbY, z: cbZ, elem: 'C' });
  }

  return atoms;
}

// ── Glycan chain: biantennary sialylated N-glycan ─────────────────────────────

/**
 * Returns array of { resName, chain, resSeq, atoms[] }
 *
 * The glycan is anchored at the glycosylation site residue (local index
 * glycanResIdx in the helix).  Each sugar ring center is placed so that:
 *   - The stem (NAG501→NAG502→MAN503) grows radially AWAY from the helix axis
 *     in the XZ plane at the attachment residue's azimuthal angle, and
 *     incrementally upward in Y.
 *   - The two branches (MAN504/MAN505, GAL506/GAL507, SIA508/SIA509) fan left
 *     and right of the stem direction in the XZ plane.
 *
 * This places the glycan directly beside the helix, visually attached to the
 * correct residue, rather than floating at an arbitrary offset.
 */
/**
 * Glycan chain builder — biantennary sialylated N-glycan.
 *
 * Ring geometry: each pyranose ring is placed so that:
 *   • The ring plane is in the XZ plane (X = radial, Z = tangential, Y = up).
 *   • Ring atom angles: C1=0°, C2=60°, C3=120°, C4=180°, C5=240°, O5=300°
 *     in the XZ plane (x = cx + r·cos a, z = cz + r·sin a, y = cy ± puckering).
 *   • The exocyclic O4 hangs in the −Z direction from C4 (not −Y), so that for
 *     the next residue placed further along the radial/Y stem, the O4 of residue n
 *     and C1 of residue n+1 can be placed within 1.4 Å by choosing ring centers
 *     that are ~4.8 Å apart (2×ringR + ~2 Å for the O4–C1 bridge).
 *
 * Connectivity is exported as { resSeq: serial } maps together with atom positions
 * so the caller can emit LINK records.
 */
function pyranoseRingXZ(cx, cy, cz, residueName) {
  // Ring in the XZ plane (not XY), Y is the vertical axis.
  const ringR = 1.42;
  // Ring angles in XZ plane: C1=0°, C2=60°, C3=120°, C4=180°, C5=240°, O5=300°
  const ringAngles = [0, 60, 120, 180, 240, 300];
  const ringNames  = ['C1', 'C2', 'C3', 'C4', 'C5', 'O5'];
  // Chair: atoms alternate ±0.25 Å in Y
  const chairY = [0.25, -0.25, 0.25, -0.25, 0.25, -0.25];

  const ringAtoms = ringNames.map((name, idx) => {
    const a = deg2rad(ringAngles[idx]);
    return {
      name,
      x: cx + ringR * Math.cos(a),
      y: cy + chairY[idx],
      z: cz + ringR * Math.sin(a),
      elem: name[0],
    };
  });

  const c1 = ringAtoms[0]; // C1 at 0°
  const c2 = ringAtoms[1]; // C2 at 60°
  const c3 = ringAtoms[2]; // C3 at 120°
  const c4 = ringAtoms[3]; // C4 at 180°  →  x = cx−1.42, z = cz
  const c5 = ringAtoms[4]; // C5 at 240°

  const exo = [
    // C6: axially off C5 (in Y direction)
    { name: 'C6', x: c5.x,        y: c5.y + 1.52, z: c5.z,        elem: 'C' },
    // O1: anomeric oxygen, +X from C1 (used in glycosidic bond as acceptor)
    { name: 'O1', x: c1.x + 1.43, y: c1.y,        z: c1.z,        elem: 'O' },
    // O2: off C2
    { name: 'O2', x: c2.x,        y: c2.y + 1.43, z: c2.z,        elem: 'O' },
    // O3: off C3 in −X direction (used in α2-3 sialyl linkage)
    { name: 'O3', x: c3.x - 1.43, y: c3.y,        z: c3.z,        elem: 'O' },
    // O4: off C4 in −Z direction (pointing away from stem, used in β1-4 bonds)
    { name: 'O4', x: c4.x,        y: c4.y,        z: c4.z - 1.43, elem: 'O' },
  ];
  const c6 = exo[0];
  exo.push({ name: 'O6', x: c6.x - 1.43, y: c6.y, z: c6.z, elem: 'O' });

  const extra = [];
  if (residueName === 'NAG') {
    const n2x = c2.x - 0.7, n2y = c2.y + 0.7, n2z = c2.z + 1.0;
    extra.push({ name: 'N2', x: n2x,       y: n2y,       z: n2z,       elem: 'N' });
    extra.push({ name: 'C7', x: n2x - 1.2, y: n2y,       z: n2z + 0.7, elem: 'C' });
    extra.push({ name: 'O7', x: n2x - 2.1, y: n2y,       z: n2z + 1.6, elem: 'O' });
  } else if (residueName === 'SIA') {
    extra.push({ name: 'C7',  x: c6.x,        y: c6.y + 1.52, z: c6.z,        elem: 'C' });
    const c7 = extra[0];
    extra.push({ name: 'C8',  x: c7.x + 1.52, y: c7.y,        z: c7.z,        elem: 'C' });
    extra.push({ name: 'N5',  x: c3.x - 1.43, y: c3.y,        z: c3.z,        elem: 'N' });
    extra.push({ name: 'O1A', x: cx - 1.5,    y: cy,          z: cz + 0.8,    elem: 'O' });
    extra.push({ name: 'O1B', x: cx - 1.5,    y: cy,          z: cz - 0.5,    elem: 'O' });
  }

  return [...ringAtoms, ...exo, ...extra];
}

function glycanChain(glycanResIdx = 1) {
  const r     = 2.26;
  const omega = deg2rad(100);
  const h     = 1.5;

  // Azimuthal angle and CA position of the glycosylation-site residue
  const phi = glycanResIdx * omega;
  const caX = r * Math.cos(phi);
  const caY = glycanResIdx * h;
  const caZ = r * Math.sin(phi);

  // Unit radial vector (pointing away from helix axis)
  const erX = Math.cos(phi);
  const erZ = Math.sin(phi);
  // Tangential vector (perpendicular to radial in XZ plane)
  const etX = -Math.sin(phi);
  const etZ =  Math.cos(phi);

  // Each ring centre is placed in the local (radial, Y, tangential) frame.
  // The pyranose ring is now in the XZ plane, so the ring spans:
  //   X: cx ± 1.42·erX  (radial)
  //   Z: cz ± 1.42·erZ  (tangential)
  //   Y: cy ± 0.25      (chair puckering)
  //
  // The glycosidic bond between residue n and n+1:
  //   O4 of residue n is at (c4.x, c4.y, c4.z − 1.43)  → −tangential
  //   C1 of residue n+1 is at cx+1 + 1.42              → +radial
  //
  // To make O4(n) ≈ C1(n+1) within 1.5 Å we choose ring-centre separations
  // so the O4 of the donor and C1 of the acceptor are spatially close.
  // With dr=4.8 Å along radial and dY=0, the distance is ~1.4 Å.

  function pos(dr, dY, dt = 0) {
    return {
      cx: caX + dr * erX + dt * etX,
      cy: caY + dY,
      cz: caZ + dr * erZ + dt * etZ,
    };
  }

  // Biantennary sialylated N-glycan:
  //   Core: NAG(501)–NAG(502)–MAN(503)
  //   α1,3 arm: MAN(504)–GAL(506)–SIA(508)
  //   α1,6 arm: MAN(505)–GAL(507)–SIA(509)
  const sugars = [
    { resName: 'NAG', resSeq: 501, ...pos(3.5,  0.0) },
    { resName: 'NAG', resSeq: 502, ...pos(7.5,  0.0) },
    { resName: 'MAN', resSeq: 503, ...pos(11.5, 0.0) },
    { resName: 'MAN', resSeq: 504, ...pos(15.5, 0.0, -3.0) },
    { resName: 'MAN', resSeq: 505, ...pos(15.5, 0.0,  3.0) },
    { resName: 'GAL', resSeq: 506, ...pos(19.5, 0.0, -5.0) },
    { resName: 'GAL', resSeq: 507, ...pos(19.5, 0.0,  5.0) },
    { resName: 'SIA', resSeq: 508, ...pos(23.5, 0.0, -7.0) },
    { resName: 'SIA', resSeq: 509, ...pos(23.5, 0.0,  7.0) },
  ].map(s => ({ ...s, chain: 'C' }));

  return sugars.map(s => ({
    resName: s.resName,
    chain:   s.chain,
    resSeq:  s.resSeq,
    atoms:   pyranoseRingXZ(s.cx, s.cy, s.cz, s.resName),
  }));
}

// ── GFLG linker (chain B) ─────────────────────────────────────────────────────

function gflgLinker() {
  // 4 residues: GLY, PHE, LEU, GLY as HETATM, extended chain going upward
  const residues = [
    {
      resName: 'GLY', resSeq: 901,
      atoms: [
        { name: 'N',  x:  0.0, y:  4.5, z:  0.0, elem: 'N' },
        { name: 'CA', x:  0.0, y:  5.5, z:  0.5, elem: 'C' },
        { name: 'C',  x:  0.0, y:  6.5, z:  1.0, elem: 'C' },
        { name: 'O',  x:  0.9, y:  7.0, z:  1.0, elem: 'O' },
      ],
    },
    {
      resName: 'PHE', resSeq: 902,
      atoms: [
        { name: 'N',  x:  0.0, y:  6.8, z:  2.0, elem: 'N' },
        { name: 'CA', x:  0.0, y:  7.8, z:  2.5, elem: 'C' },
        { name: 'C',  x:  0.0, y:  8.8, z:  3.0, elem: 'C' },
        { name: 'O',  x:  0.9, y:  9.3, z:  3.0, elem: 'O' },
        { name: 'CB', x: -1.2, y:  7.6, z:  3.3, elem: 'C' },
        // Phenyl ring
        { name: 'CG',  x: -1.4, y:  6.5, z:  4.2, elem: 'C' },
        { name: 'CD1', x: -0.5, y:  5.5, z:  4.5, elem: 'C' },
        { name: 'CD2', x: -2.5, y:  6.3, z:  4.9, elem: 'C' },
        { name: 'CE1', x: -0.7, y:  4.5, z:  5.4, elem: 'C' },
        { name: 'CE2', x: -2.7, y:  5.3, z:  5.8, elem: 'C' },
        { name: 'CZ',  x: -1.8, y:  4.3, z:  6.1, elem: 'C' },
      ],
    },
    {
      resName: 'LEU', resSeq: 903,
      atoms: [
        { name: 'N',  x:  0.0, y:  9.1, z:  4.0, elem: 'N' },
        { name: 'CA', x:  0.0, y: 10.1, z:  4.5, elem: 'C' },
        { name: 'C',  x:  0.0, y: 11.1, z:  5.0, elem: 'C' },
        { name: 'O',  x:  0.9, y: 11.6, z:  5.0, elem: 'O' },
        { name: 'CB', x: -1.2, y:  9.9, z:  5.3, elem: 'C' },
        { name: 'CG', x: -1.4, y:  8.8, z:  6.2, elem: 'C' },
        { name: 'CD1',x: -0.3, y:  7.8, z:  5.9, elem: 'C' },
        { name: 'CD2',x: -2.8, y:  8.3, z:  6.3, elem: 'C' },
      ],
    },
    {
      resName: 'GLY', resSeq: 904,
      atoms: [
        { name: 'N',  x:  0.0, y: 11.4, z:  6.0, elem: 'N' },
        { name: 'CA', x:  0.0, y: 12.4, z:  6.5, elem: 'C' },
        { name: 'C',  x:  0.0, y: 13.4, z:  7.0, elem: 'C' },
        { name: 'O',  x:  0.9, y: 13.9, z:  7.0, elem: 'O' },
      ],
    },
  ];
  return residues;
}

// ── GLP-1(7-36) sequence ──────────────────────────────────────────────────────

const GLP1_SEQ = [
  'HIS','ALA','GLU','GLY','THR','PHE','THR','SER',
  'ASP','VAL','SER','SER','TYR','LEU','GLU','GLY',
  'GLN','ALA','ALA','LYS','GLU','PHE','ILE','ALA',
  'TRP','LEU','VAL','LYS','GLY','ARG',
];
const GLP1_START = 7; // canonical numbering starts at 7

const GLY_SET = new Set(['GLY']);

// ── PDB file builder ──────────────────────────────────────────────────────────

function buildGLP1PDB(opts = {}) {
  const {
    title       = 'GLP1-REFERENCE',
    glycanChains = true,
    linker       = true,
    mutations    = [],
    glycanPos    = 2,   // 1-based index into GLP1_SEQ (residue 8 = position 2)
    remark       = '',
  } = opts;

  const lines = [];

  // Header
  lines.push('HEADER    GLP-1 GLYCOCONJUGATE  GLYCO-MASKING PROGRAM');
  lines.push(`TITLE     ${title}`);
  lines.push('REMARK  1 GLP-1(7-36) GLYCO-MASKED ANALOG');
  lines.push(`REMARK  2 GLYCAN:  @ LOCAL POS ${glycanPos} (CANONICAL POS ${GLP1_START + glycanPos - 1})`);
  lines.push(`REMARK  3 LINKER: ${linker ? 'GFLG' : 'NONE'}`);
  lines.push(`REMARK  4 MUTATIONS: ${mutations.length ? mutations.join(', ') : 'NONE'}`);
  lines.push('REMARK  5 IN SILICO GENERATED — NOT EXPERIMENTALLY VALIDATED');

  // SEQRES
  lines.push(`SEQRES   1 A   30  ${GLP1_SEQ.slice(0, 13).join(' ')}`);
  lines.push(`SEQRES   2 A   30  ${GLP1_SEQ.slice(13, 26).join(' ')}`);
  lines.push(`SEQRES   3 A   30  ${GLP1_SEQ.slice(26).join(' ')}`);

  // HELIX record: entire GLP-1(7-36) sequence is a right-handed alpha helix
  lines.push(helixRecord(
    1, 1,
    GLP1_SEQ[0], 'A', GLP1_START,
    GLP1_SEQ[GLP1_SEQ.length - 1], 'A', GLP1_START + GLP1_SEQ.length - 1,
    1, GLP1_SEQ.length,
  ));

  // LINK records for glycosidic bonds (must appear BEFORE ATOM section).
  // Molstar converts LINK records into struct_conn entries used for
  // carbohydrate topology detection and SNFG link cylinder rendering.
  // Without these, each sugar is classified as an independent ligand.
  if (glycanChains) {
    const resNames = { 501:'NAG', 502:'NAG', 503:'MAN', 504:'MAN', 505:'MAN',
                       506:'GAL', 507:'GAL', 508:'SIA', 509:'SIA' };
    const glycosidicLinks = [
      ['O4','NAG',501, 'C1','NAG',502],
      ['O4','NAG',502, 'C1','MAN',503],
      ['O3','MAN',503, 'C1','MAN',504],
      ['O6','MAN',503, 'C1','MAN',505],
      ['O4','MAN',504, 'C1','GAL',506],
      ['O4','MAN',505, 'C1','GAL',507],
      ['O3','GAL',506, 'C2','SIA',508],
      ['O3','GAL',507, 'C2','SIA',509],
    ];
    for (const [a1, r1, s1, a2, r2, s2] of glycosidicLinks) {
      lines.push(linkRecord(a1, r1, 'C', s1, a2, r2, 'C', s2, 1.41));
    }
  }

  let serial = 1;

  // Chain A: protein backbone
  for (let i = 0; i < GLP1_SEQ.length; i++) {
    const resName = GLP1_SEQ[i];
    const resSeq  = GLP1_START + i;
    const isGly   = GLY_SET.has(resName);
    const atoms   = helixResidue(i, isGly);
    for (const a of atoms) {
      lines.push(atomLine('ATOM', serial++, a.name, resName, 'A', resSeq, a.x, a.y, a.z, 1.00, 15.00, a.elem));
    }
  }
  lines.push('TER');

  // Chain B: GFLG linker (HETATM)
  if (linker) {
    const linkerResidues = gflgLinker();
    for (const res of linkerResidues) {
      for (const a of res.atoms) {
        lines.push(atomLine('HETATM', serial++, a.name, res.resName, 'B', res.resSeq, a.x, a.y, a.z, 1.00, 20.00, a.elem));
      }
    }
    lines.push('TER');
  }

  // Chain C: glycan (HETATM)
  // glycanPos is 1-based; convert to 0-based residue index for helixResidue()
  if (glycanChains) {
    const sugars = glycanChain(glycanPos - 1);
    for (const s of sugars) {
      for (const a of s.atoms) {
        lines.push(atomLine('HETATM', serial++, a.name, s.resName, s.chain, s.resSeq, a.x, a.y, a.z, 1.00, 20.00, a.elem));
      }
    }
    lines.push('TER');

  }

  lines.push('END');
  return lines.join('\n') + '\n';
}

// ── Simple helical peptide (example1, example2) ───────────────────────────────

function buildHelixPDB(numResidues, title) {
  const seq = ['ALA','GLY','LEU','VAL','ILE','ALA','GLY','LEU','VAL','ILE'].slice(0, numResidues);
  const lines = [];
  lines.push(`HEADER    HELICAL PEPTIDE`);
  lines.push(`TITLE     ${title}`);
  lines.push('REMARK    IDEAL ALPHA HELIX');

  // HELIX record: entire sequence is a right-handed alpha helix
  lines.push(helixRecord(1, 1, seq[0], 'A', 1, seq[seq.length - 1], 'A', seq.length, 1, seq.length));

  let serial = 1;
  for (let i = 0; i < seq.length; i++) {
    const resName = seq[i];
    const resSeq  = i + 1;
    const isGly   = resName === 'GLY';
    const atoms   = helixResidue(i, isGly);
    for (const a of atoms) {
      lines.push(atomLine('ATOM', serial++, a.name, resName, 'A', resSeq, a.x, a.y, a.z, 1.00, 10.00, a.elem));
    }
  }
  lines.push('TER');
  lines.push('END');
  return lines.join('\n') + '\n';
}

// ── Write all files ───────────────────────────────────────────────────────────

const files = {
  'glp1_reference.pdb': buildGLP1PDB({
    title:       'GLP1-REFERENCE',
    glycanChains: true,
    linker:       true,
    glycanPos:    2,
  }),

  'glp1_gm_f54d54.pdb': buildGLP1PDB({
    title:       'GLP1-GM-F54D54',
    glycanChains: true,
    linker:       true,
    glycanPos:    2,
    mutations:    ['A8K'],
    remark:       'F54D54 variant',
  }),

  'glp1_gm_942303.pdb': buildGLP1PDB({
    title:       'GLP1-GM-942303',
    glycanChains: true,
    linker:       true,
    glycanPos:    3,
    mutations:    ['S12A'],
    remark:       '942303 variant',
  }),

  'glp1_gm_e562ad.pdb': buildGLP1PDB({
    title:       'GLP1-GM-E562AD',
    glycanChains: true,
    linker:       true,
    glycanPos:    4,
    mutations:    ['E9D'],
    remark:       'E562AD variant',
  }),

  'example1.pdb': buildHelixPDB(10, 'EXAMPLE 10-RESIDUE HELIX'),
  'example2.pdb': buildHelixPDB(7,  'EXAMPLE 7-RESIDUE HELIX'),
};

for (const [filename, content] of Object.entries(files)) {
  const outPath = join(OUT_DIR, filename);
  writeFileSync(outPath, content, 'utf8');
  const lines = content.split('\n');
  console.log(`\nWrote: ${outPath}  (${lines.length} lines)`);
  console.log('--- First 20 lines ---');
  lines.slice(0, 20).forEach((l, i) => console.log(`${String(i + 1).padStart(3)}: ${l}`));
}

console.log('\nAll PDB files generated successfully.');
