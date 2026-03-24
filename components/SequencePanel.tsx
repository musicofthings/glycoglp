'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ResidueBadge from '@/components/ResidueBadge';
import { parsePdbSequence, type ResidueEntry } from '@/lib/sequenceMapper';
import { useViewerStore } from '@/lib/state';

type Props = { structureId: string };

export default function SequencePanel({ structureId }: Props) {
  const [residues, setResidues] = useState<ResidueEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewerState = useViewerStore((s) => s.viewers[structureId]);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setSelectedResidue = useViewerStore((s) => s.setSelectedResidue);
  const setHoveredResidue = useViewerStore((s) => s.setHoveredResidue);

  useEffect(() => {
    ensureViewer(structureId);
    void fetch(`/api/structure?id=${structureId}`)
      .then((r) => r.text())
      .then((pdb) => setResidues(parsePdbSequence(pdb)));
  }, [ensureViewer, structureId]);

  useEffect(() => {
    if (!viewerState?.selectedResidue || !containerRef.current) return;
    const target = containerRef.current.querySelector(`[data-residue='${viewerState.selectedResidue}']`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [viewerState?.selectedResidue]);

  const mutationByPosition = useMemo(() => {
    const map = new Map<number, string>();
    for (const mutation of viewerState?.annotations.mutations ?? []) {
      map.set(mutation.position, `${mutation.from}→${mutation.to}`);
    }
    return map;
  }, [viewerState?.annotations.mutations]);

  if (!viewerState) return null;

  return (
    <div className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sequence</h3>
      <div ref={containerRef} className="flex gap-2 overflow-x-auto rounded-md border border-slate-200 p-2">
        {residues.map((residue) => {
          const annotated = viewerState.annotations.highlighted.includes(residue.authSeqId);
          const mutationTip = mutationByPosition.get(residue.authSeqId);

          return (
            <div key={`${residue.chainId}-${residue.authSeqId}`} data-residue={residue.authSeqId}>
              <ResidueBadge
                position={residue.authSeqId}
                residue={residue.label}
                selected={viewerState.selectedResidue === residue.authSeqId}
                annotated={annotated}
                tooltip={mutationTip ? `Mutation: ${mutationTip}` : undefined}
                onClick={() => setSelectedResidue(structureId, residue.authSeqId)}
                onMouseEnter={() => setHoveredResidue(structureId, residue.authSeqId)}
                onMouseLeave={() => setHoveredResidue(structureId, null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
