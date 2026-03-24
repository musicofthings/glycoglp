import type { GlycoAnnotation } from '@/lib/state';

const GLYCAN_CODES = new Set(['NAG', 'MAN', 'BMA', 'GAL', 'FUC', 'SIA']);
const STANDARD_AA = new Set([
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE',
  'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL'
]);

type AtomResidue = { chain: string; position: number; name: string; x: number; y: number; z: number };

type GlycanResidue = AtomResidue;

function parseAtomLine(line: string): AtomResidue | null {
  const record = line.slice(0, 6).trim();
  if (record !== 'ATOM' && record !== 'HETATM') return null;

  const name = line.slice(17, 20).trim();
  const chain = line.slice(21, 22).trim() || 'A';
  const position = Number.parseInt(line.slice(22, 26).trim(), 10);
  if (!Number.isFinite(position)) return null;

  const x = Number.parseFloat(line.slice(30, 38).trim());
  const y = Number.parseFloat(line.slice(38, 46).trim());
  const z = Number.parseFloat(line.slice(46, 54).trim());
  if (![x, y, z].every(Number.isFinite)) return null;

  return { chain, position, name, x, y, z };
}

function squaredDistance(a: AtomResidue, b: AtomResidue): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function detectGlycosylationSites(pdbText: string): GlycoAnnotation[] {
  const atoms: AtomResidue[] = [];
  for (const line of pdbText.split('\n')) {
    const parsed = parseAtomLine(line);
    if (parsed) atoms.push(parsed);
  }

  const proteinResidues = new Map<string, AtomResidue>();
  const glycans: GlycanResidue[] = [];

  for (const atom of atoms) {
    const key = `${atom.chain}:${atom.position}`;
    if (GLYCAN_CODES.has(atom.name) || (!STANDARD_AA.has(atom.name) && atom.name.length === 3)) {
      glycans.push(atom);
      continue;
    }

    if (STANDARD_AA.has(atom.name) && !proteinResidues.has(key)) {
      proteinResidues.set(key, atom);
    }
  }

  const grouped = new Map<string, GlycoAnnotation>();

  for (const glycan of glycans) {
    let bestAnchor: AtomResidue | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const residue of proteinResidues.values()) {
      if (residue.chain !== glycan.chain) continue;
      const d2 = squaredDistance(glycan, residue);
      if (d2 < bestDistance) {
        bestDistance = d2;
        bestAnchor = residue;
      }
    }

    if (!bestAnchor || bestDistance > 64) continue;

    const type: GlycoAnnotation['type'] =
      bestAnchor.name === 'ASN' ? 'N-linked' : bestAnchor.name === 'SER' || bestAnchor.name === 'THR' ? 'O-linked' : 'Unknown';

    const key = `${bestAnchor.chain}:${bestAnchor.position}`;
    const existing = grouped.get(key);

    if (existing) {
      const glycanSet = new Set(existing.glycanResidues ?? []);
      glycanSet.add(glycan.name);
      existing.glycanResidues = [...glycanSet];
    } else {
      grouped.set(key, {
        chain: bestAnchor.chain,
        position: bestAnchor.position,
        type,
        confidence: 0.85,
        glycanResidues: [glycan.name]
      });
    }
  }

  return [...grouped.values()].sort((a, b) => a.position - b.position);
}

export function isGlycanResidueName(name: string): boolean {
  return GLYCAN_CODES.has(name);
}
