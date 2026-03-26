'use client';

import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { loadStructureText, parseStructureRef } from '@/lib/structureSource';
import { detectGlycosylationSites } from '@/lib/glycan';
import { useViewerStore } from '@/lib/state';

type Props = {
  viewerId: string;
  structureId: string;
};

type MolPlugin = Awaited<ReturnType<typeof createPluginUI>>;

async function applyStructure(
  plugin: MolPlugin,
  structureId: string,
  viewerId: string,
) {
  await plugin.clear();

  const text = await loadStructureText(structureId, viewerId);
  if (!text.trim()) {
    plugin.log.warn('No structure data available.');
    return;
  }

  // Fetch curated annotations; fall back to PDB-derived glycan detection
  try {
    const { id } = parseStructureRef(structureId);
    const resp = await fetch(`/api/annotations?id=${encodeURIComponent(id)}`);
    const ann = resp.ok ? (await resp.json() as Record<string, unknown>) : null;
    const glycoFromPdb = detectGlycosylationSites(text);
    useViewerStore.getState().setAnnotations(viewerId, {
      highlighted:   (ann?.highlighted   as number[]   ?? []),
      mutations:     (ann?.mutations     as never[]    ?? []),
      glycosylation: (ann?.glycosylation as never[]    ?? []).length
        ? (ann!.glycosylation as never[])
        : glycoFromPdb,
    });
  } catch {
    // Best-effort — leave annotations empty rather than crashing
  }

  const format = text.trimStart().startsWith('data_') ? 'mmcif' : 'pdb';
  const data = await plugin.builders.data.rawData({ data: text, label: structureId });
  const traj = await plugin.builders.structure.parseTrajectory(data, format);
  await plugin.builders.structure.hierarchy.applyPreset(traj, 'default', {
    structure:            { name: 'model', params: {} },
    showUnitcell:         false,
    representationPreset: 'auto',
  });
}

export default function MolstarViewer({ viewerId, structureId }: Props) {
  const elRef   = useRef<HTMLDivElement>(null);
  const plugRef = useRef<MolPlugin | null>(null);
  // Tracks the most-recent structureId so the async init path always loads
  // the latest value even if props changed while createPluginUI was in flight.
  const latestId = useRef(structureId);
  latestId.current = structureId;

  // ── Init: create plugin once on DOM mount, destroy on unmount ──────────
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let live = true;
    // `pending` holds the plugin reference until it is stored in `plugRef`,
    // so the cleanup can dispose it even if the component unmounts mid-init.
    let pending: MolPlugin | undefined;

    createPluginUI({ target: el, render: renderReact18, spec: DefaultPluginUISpec() })
      .then((p) => {
        pending = p;
        if (!live) {
          p.dispose();
          return;
        }
        plugRef.current = p;
        return applyStructure(p, latestId.current, viewerId);
      })
      .catch(console.error);

    return () => {
      live = false;
      const p = plugRef.current ?? pending;
      plugRef.current = null;
      p?.dispose();
    };
    // Intentionally empty deps: plugin lifecycle is tied to DOM mount only.
    // viewerId is stable per component instance in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload structure whenever structureId changes (after init) ──────────
  useEffect(() => {
    const p = plugRef.current;
    if (!p) return; // init not yet complete; init path will use latestId
    void applyStructure(p, structureId, viewerId);
  }, [structureId, viewerId]);

  return (
    <div
      ref={elRef}
      className="h-[70vh] w-full overflow-hidden rounded border border-slate-200"
    />
  );
}
