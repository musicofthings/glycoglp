export type ResidueEntry = {
  chainId: string;
  authSeqId: number;
  label: string;
};

const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
  HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
  THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V'
};

export function parsePdbSequence(pdbText: string): ResidueEntry[] {
  const residues = new Map<string, ResidueEntry>();
  const lines = pdbText.split('\n');

  for (const line of lines) {
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.slice(12, 16).trim();
    if (atomName !== 'CA') continue;

    const resName = line.slice(17, 20).trim();
    const chainId = line.slice(21, 22).trim() || 'A';
    const authSeqId = Number.parseInt(line.slice(22, 26).trim(), 10);
    if (Number.isNaN(authSeqId)) continue;

    const key = `${chainId}:${authSeqId}`;
    if (!residues.has(key)) {
      residues.set(key, {
        chainId,
        authSeqId,
        label: THREE_TO_ONE[resName] ?? 'X'
      });
    }
  }

  return [...residues.values()].sort((a, b) => {
    if (a.chainId === b.chainId) return a.authSeqId - b.authSeqId;
    return a.chainId.localeCompare(b.chainId);
  });
}
