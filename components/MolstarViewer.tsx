'use client';

import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { Asset } from 'molstar/lib/mol-util/assets';
import { detectGlycosylationSites } from '@/lib/glycan';
import { getAuthSeqIdFromLoci } from '@/lib/molstar';
import { loadStructureText } from '@/lib/structureSource';
import { type GlycoAnnotation, useViewerStore } from '@/lib/state';

type Props = {
  viewerId: string;
  structureId: string;
};

type MolstarPlugin = Awaited<ReturnType<typeof createPluginUI>>;
type MolstarComponent = Awaited<
  ReturnType<MolstarPlugin['builders']['structure']['tryCreateComponentStatic']>
>;

type PluginRef = {
  plugin: MolstarPlugin;
  proteinComponent?: MolstarComponent;
  glycanComponent?: MolstarComponent;
  structureId: string;
};

type InteractionEvent = {
  current: {
    loci: unknown;
  };
};

type ApiAnnotations = {
  highlighted?: number[];
  mutations?: Array<{ position: number; from: string; to: string }>;
  glycosylation?: GlycoAnnotation[];
};

const pluginRegistry = new Map<string, PluginRef>();

function combineGlycoSites(detected: GlycoAnnotation[], fromApi: GlycoAnnotation[]): GlycoAnnotation[] {
  const merged: GlycoAnnotation[] = [];

  for (const item of [...detected, ...fromApi]) {
    const exists = merged.some((x) => x.position === item.position && x.chain === item.chain);
    if (!exists) merged.push(item);
  }

  return merged;
}

async function applyGlycanRepresentations(
  pluginRef: PluginRef,
  options: {
    showGlycans: boolean;
    glycanOnly: boolean;
    glycanRepresentation: 'stick' | 'sphere';
  }
) {
  const { proteinComponent, glycanComponent, plugin } = pluginRef;

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
  const setSelectedResidue = useViewerStore((s) => s.setSelectedResidue);
  const setAnnotations = useViewerStore((s) => s.setAnnotations);
  const selectedResidue = useViewerStore((s) => s.viewers[viewerId]?.selectedResidue);
  const showGlycans = useViewerStore((s) => s.viewers[viewerId]?.showGlycans ?? true);
  const glycanOnly = useViewerStore((s) => s.viewers[viewerId]?.glycanOnly ?? false);
  const glycanRepresentation = useViewerStore((s) => s.viewers[viewerId]?.glycanRepresentation ?? 'stick');

  useEffect(() => {
    ensureViewer(viewerId);
  }, [ensureViewer, viewerId]);

  useEffect(() => {
    if (!hostRef.current) return;

    let isMounted = true;

    async function init() {
      const previous = pluginRegistry.get(viewerId);
      if (previous?.plugin) {
        previous.plugin.dispose();
        pluginRegistry.delete(viewerId);
      }

      const plugin = await createPluginUI({
        target: hostRef.current!,
        render: renderReact18,
        spec: DefaultPluginUISpec()
      });
      if (!isMounted) {
        plugin.dispose();
        return;
      }

      const structureText = await loadStructureText(structureId, viewerId);
      if (!structureText.trim()) {
        plugin.log.warn('No structure data available.');
        return;
      }

      const data = structureId.startsWith('upload-')
        ? await plugin.builders.data.rawData({ data: structureText, label: `uploaded-${viewerId}` })
        : await plugin.builders.data.download({
            url: Asset.Url(`/api/structure?id=${structureId}`),
            isBinary: false
          });

      const format = structureText.trimStart().startsWith('data_') ? 'mmcif' : 'pdb';
      const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
      const model = await plugin.builders.structure.createModel(trajectory);
      const structure = await plugin.builders.structure.createStructure(model, { name: 'model', params: {} });

      const proteinComponent = await plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer', {
        label: `protein-${viewerId}`
      });
      const glycanComponent = await plugin.builders.structure.tryCreateComponentStatic(structure, 'ligand', {
        label: `glycan-${viewerId}`
      });

      const pluginRef: PluginRef = { plugin, proteinComponent, glycanComponent, structureId };
      pluginRegistry.set(viewerId, pluginRef);

      const apiAnnotations: ApiAnnotations = await fetch(`/api/annotations?id=${structureId}`)
        .then((r) => r.json())
        .catch(() => ({ highlighted: [], mutations: [], glycosylation: [] }));

      const detectedSites = detectGlycosylationSites(structureText);
      const combinedGlyco = combineGlycoSites(detectedSites, apiAnnotations.glycosylation ?? []);

      setAnnotations(viewerId, {
        highlighted: apiAnnotations.highlighted ?? [],
        mutations: apiAnnotations.mutations ?? [],
        glycosylation: combinedGlyco
      });

      await applyGlycanRepresentations(pluginRef, {
        showGlycans,
        glycanOnly,
        glycanRepresentation
      });

      plugin.behaviors.interaction.click.subscribe((event: InteractionEvent) => {
        const residue = getAuthSeqIdFromLoci(event.current.loci);
        if (residue !== null) {
          setSelectedResidue(viewerId, residue);
          plugin.managers.camera.focusLoci(
            event.current.loci as Parameters<typeof plugin.managers.camera.focusLoci>[0]
          );
        }
      });

      plugin.behaviors.interaction.hover.subscribe((event: InteractionEvent) => {
        const residue = getAuthSeqIdFromLoci(event.current.loci);
        if (residue !== null) {
          const isGlycoSite = combinedGlyco.some((site) => site.position === residue);
          if (isGlycoSite) {
            plugin.managers.interactivity.lociHighlights.highlightOnly({
              loci: event.current.loci as Parameters<
                typeof plugin.managers.interactivity.lociHighlights.highlightOnly
              >[0]['loci']
            });
          }
        }
      });
    }

    void init();

    return () => {
      isMounted = false;
      const current = pluginRegistry.get(viewerId);
      if (current?.plugin) {
        current.plugin.dispose();
        pluginRegistry.delete(viewerId);
      }
    };
  }, [setAnnotations, setSelectedResidue, structureId, viewerId]);

  useEffect(() => {
    const ref = pluginRegistry.get(viewerId);
    if (!ref || ref.structureId !== structureId) return;

    void applyGlycanRepresentations(ref, {
      showGlycans,
      glycanOnly,
      glycanRepresentation
    });

    if (selectedResidue !== null) {
      ref.plugin.log.message(`Selected residue ${selectedResidue}`);
    }
  }, [glycanOnly, glycanRepresentation, selectedResidue, showGlycans, structureId, viewerId]);

  return <div ref={hostRef} className="h-[420px] w-full overflow-hidden rounded border border-slate-200" />;
}
