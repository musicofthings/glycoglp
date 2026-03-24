'use client';

import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { Asset } from 'molstar/lib/mol-util/assets';
import { detectGlycosylationSites } from '@/lib/glycan';
import { getAuthSeqIdFromLoci } from '@/lib/molstar';
import { loadStructureText } from '@/lib/structureSource';
import { useViewerStore } from '@/lib/state';

type Props = {
  viewerId: string;
  structureId: string;
};

type PluginRef = {
  plugin: any;
  proteinComponent?: any;
  glycanComponent?: any;
};

const pluginRegistry = new Map<string, PluginRef>();

async function applyGlycanRepresentations(pluginRef: PluginRef, options: {
  showGlycans: boolean;
  glycanOnly: boolean;
  glycanRepresentation: 'stick' | 'sphere';
}) {
  const { proteinComponent, glycanComponent, plugin } = pluginRef;
  if (!plugin) return;

  if (proteinComponent) {
    await plugin.builders.structure.representation.addRepresentation(proteinComponent, {
      type: options.glycanOnly ? 'spacefill' : 'cartoon',
      color: 'chain-id',
      alpha: options.glycanOnly ? 0.08 : 1
    });
  }

  if (glycanComponent) {
    await plugin.builders.structure.representation.addRepresentation(glycanComponent, {
      type: options.glycanRepresentation === 'sphere' ? 'spacefill' : 'ball-and-stick',
      color: 'element-symbol',
      alpha: options.showGlycans ? 1 : 0
    });
  }
}

export default function MolstarViewer({ viewerId, structureId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const viewerState = useViewerStore((s) => s.viewers[viewerId]);
  const setSelectedResidue = useViewerStore((s) => s.setSelectedResidue);
  const setAnnotations = useViewerStore((s) => s.setAnnotations);

  useEffect(() => {
    ensureViewer(viewerId);
  }, [ensureViewer, viewerId]);

  useEffect(() => {
    if (!hostRef.current || !viewerState) return;

    let isMounted = true;

    async function init() {
      const previous = pluginRegistry.get(viewerId);
      if (previous?.plugin) {
        previous.plugin.dispose();
        pluginRegistry.delete(viewerId);
      }

      const plugin = await createPluginUI({ target: hostRef.current!, spec: DefaultPluginUISpec() });
      if (!isMounted) return;

      let structureText = await loadStructureText(structureId, viewerId);

      let data: any;
      if (structureId.startsWith('upload-')) {
        data = await plugin.builders.data.rawData({ data: structureText, label: `uploaded-${viewerId}` });
      } else {
        data = await plugin.builders.data.download({
          url: Asset.Url(`/api/structure?id=${structureId}`),
          isBinary: false
        });
      }

      const format = structureText.trimStart().startsWith('data_') ? 'mmcif' : 'pdb';
      const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');

      const structure = plugin.managers.structure.hierarchy.current.structures?.[0]?.cell?.obj?.data;
      const proteinComponent = structure
        ? await plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer', `protein-${viewerId}`)
        : undefined;
      const glycanComponent = structure
        ? await plugin.builders.structure.tryCreateComponentStatic(structure, 'ligand', `glycan-${viewerId}`)
        : undefined;

      const pluginRef: PluginRef = { plugin, proteinComponent, glycanComponent };
      pluginRegistry.set(viewerId, pluginRef);

      const apiAnnotations = await fetch(`/api/annotations?id=${structureId}`).then((r) => r.json()).catch(() => ({
        highlighted: [],
        mutations: [],
        glycosylation: []
      }));

      const detectedSites = detectGlycosylationSites(structureText);
      const combinedGlyco = [...detectedSites, ...(apiAnnotations.glycosylation ?? [])].reduce((acc: any[], item: any) => {
        if (!acc.some((x) => x.position === item.position && x.chain === item.chain)) acc.push(item);
        return acc;
      }, []);

      setAnnotations(viewerId, {
        highlighted: apiAnnotations.highlighted ?? [],
        mutations: apiAnnotations.mutations ?? [],
        glycosylation: combinedGlyco
      });

      await applyGlycanRepresentations(pluginRef, {
        showGlycans: viewerState.showGlycans,
        glycanOnly: viewerState.glycanOnly,
        glycanRepresentation: viewerState.glycanRepresentation
      });

      plugin.behaviors.interaction.click.subscribe((event: any) => {
        const residue = getAuthSeqIdFromLoci(event.current.loci);
        if (residue !== null) {
          setSelectedResidue(viewerId, residue);
          plugin.managers.camera.focusLoci(event.current.loci);
        }
      });

      plugin.behaviors.interaction.hover.subscribe((event: any) => {
        const residue = getAuthSeqIdFromLoci(event.current.loci);
        if (residue !== null) {
          const isGlycoSite = combinedGlyco.some((site: any) => site.position === residue);
          if (isGlycoSite) {
            plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: event.current.loci });
          }
        }
      });
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, [setAnnotations, setSelectedResidue, structureId, viewerId, viewerState]);

  useEffect(() => {
    const ref = pluginRegistry.get(viewerId);
    if (!ref || !viewerState) return;

    void applyGlycanRepresentations(ref, {
      showGlycans: viewerState.showGlycans,
      glycanOnly: viewerState.glycanOnly,
      glycanRepresentation: viewerState.glycanRepresentation
    });

    const structures = ref.plugin.managers.structure.hierarchy.current.structures;
    if (!structures?.length) return;

    void ref.plugin.managers.structure.component.updateRepresentationsTheme(structures, {
      color: viewerState.colorMode === 'confidence' ? 'uncertainty' : viewerState.colorMode
    });

    if (viewerState.selectedResidue !== null) {
      ref.plugin.log.message(`Selected residue ${viewerState.selectedResidue}`);
    }
  }, [viewerId, viewerState]);

  return <div ref={hostRef} className="h-[420px] w-full overflow-hidden rounded border border-slate-200" />;
}
