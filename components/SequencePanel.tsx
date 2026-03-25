'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ResidueBadge from '@/components/ResidueBadge';
import { parsePdbSequence, type ResidueEntry } from '@/lib/sequenceMapper';
import { loadStructureText } from '@/lib/structureSource';
import { useViewerStore } from '@/lib/state';

type Props = {
  viewerId: string;
  structureId: string;
};

export default function SequencePanel({ viewerId, structureId }: Props) {
  const [residues, setResidues] = useState<ResidueEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewerState = useViewerStore((s) => s.viewers[viewerId]);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setSelectedResidue = useViewerStore((s) => s.setSelectedResidue);
  const setHoveredResidue = useViewerStore((s) => s.setHoveredResidue);

  useEffect(() => {
    ensureViewer(viewerId);
  }, [ensureViewer, viewerId]);

  useEffect(() => {
    void loadStructureText(structureId, viewerId).then((pdb) => {
      setResidues(parsePdbSequence(pdb));
    });
  }, [structureId, viewerId]);

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

  const glycoByPosition = useMemo(() => {
    const map = new Map<number, string>();
    for (const site of viewerState?.annotations.glycosylation ?? []) {
      map.set(site.position, `${site.type}: ${(site.glycanResidues ?? []).join('-') || 'glycan chain'}`);
    }
    return map;
  }, [viewerState?.annotations.glycosylation]);

  if (!viewerState) return null;

  return (
    <div className="mt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sequence</h3>
      <div ref={containerRef} className="flex gap-2 overflow-x-auto rounded-md border border-slate-200 p-2">
        {residues.map((residue) => {
          const annotated = viewerState.annotations.highlighted.includes(residue.authSeqId);
          const mutationTip = mutationByPosition.get(residue.authSeqId);
          const glycoTip = glycoByPosition.get(residue.authSeqId);

          return (
            <div key={`${residue.chainId}-${residue.authSeqId}`} data-residue={residue.authSeqId}>
              <ResidueBadge
                position={residue.authSeqId}
                residue={residue.label}
                selected={viewerState.selectedResidue === residue.authSeqId}
                annotated={annotated}
                glycosylated={Boolean(glycoTip) && viewerState.highlightGlycosites}
                badge={glycoTip ? '🧬' : undefined}
                tooltip={[glycoTip, mutationTip].filter(Boolean).join(' | ') || undefined}
                onClick={() => setSelectedResidue(viewerId, residue.authSeqId)}
                onMouseEnter={() => setHoveredResidue(viewerId, residue.authSeqId)}
                onMouseLeave={() => setHoveredResidue(viewerId, null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
