'use client';

import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { Asset } from 'molstar/lib/mol-util/assets';
import { useViewerStore } from '@/lib/state';
import { getAuthSeqIdFromLoci } from '@/lib/molstar';

type Props = {
  structureId: string;
};

const pluginRegistry = new Map<string, any>();

export default function MolstarViewer({ structureId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setSelectedResidue = useViewerStore((s) => s.setSelectedResidue);
  const setAnnotations = useViewerStore((s) => s.setAnnotations);
  const viewerState = useViewerStore((s) => s.viewers[structureId]);

  useEffect(() => {
    ensureViewer(structureId);
  }, [ensureViewer, structureId]);

  useEffect(() => {
    if (!hostRef.current) return;

    let isMounted = true;

    async function init() {
      if (pluginRegistry.has(structureId) || !hostRef.current) return;

      const plugin = await createPluginUI({ target: hostRef.current, spec: DefaultPluginUISpec() });
      if (!isMounted) return;

      pluginRegistry.set(structureId, plugin);

      const data = await plugin.builders.data.download({
        url: Asset.Url(`/api/structure?id=${structureId}`),
        isBinary: false
      });
      const trajectory = await plugin.builders.structure.parseTrajectory(data, 'pdb');
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');

      const annotations = await fetch(`/api/annotations?id=${structureId}`).then((r) => r.json());
      setAnnotations(structureId, annotations);

      plugin.behaviors.interaction.click.subscribe((event: any) => {
        const residue = getAuthSeqIdFromLoci(event.current.loci);
        if (residue !== null) setSelectedResidue(structureId, residue);
      });
    }

    void init();

    return () => {
      isMounted = false;
      const plugin = pluginRegistry.get(structureId);
      plugin?.dispose();
      pluginRegistry.delete(structureId);
    };
  }, [setAnnotations, setSelectedResidue, structureId]);

  useEffect(() => {
    const plugin = pluginRegistry.get(structureId);
    if (!plugin || !viewerState) return;

    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (!structures?.length) return;

    void plugin.managers.structure.component.updateRepresentationsTheme(structures, {
      color: viewerState.colorMode === 'confidence' ? 'uncertainty' : viewerState.colorMode
    });

    if (viewerState.selectedResidue !== null) {
      plugin.log.message(`Selected residue ${viewerState.selectedResidue}`);
    }
  }, [structureId, viewerState]);

  return <div ref={hostRef} className="h-[420px] w-full overflow-hidden rounded border border-slate-200" />;
}
