'use client';

import { useEffect, useRef } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { Asset } from 'molstar/lib/mol-util/assets';
import { buildStructureApiUrl, loadStructureText } from '@/lib/structureSource';

type Props = {
  viewerId: string;
  structureId: string;
};

type MolstarPlugin = Awaited<ReturnType<typeof createPluginUI>>;

const pluginRegistry = new Map<string, MolstarPlugin>();

async function loadStructure(plugin: MolstarPlugin, structureId: string, viewerId: string) {
  await plugin.clear();

  const structureText = await loadStructureText(structureId, viewerId);
  if (!structureText.trim()) {
    plugin.log.warn('No structure data available.');
    return;
  }

  const data = structureId.startsWith('upload-')
    ? await plugin.builders.data.rawData({ data: structureText, label: `uploaded-${viewerId}` })
    : await plugin.builders.data.download({
        url: Asset.Url(buildStructureApiUrl(structureId)),
        isBinary: false
      });

  const format = structureText.trimStart().startsWith('data_') ? 'mmcif' : 'pdb';
  const trajectory = await plugin.builders.structure.parseTrajectory(data, format);

  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
    structure: { name: 'model', params: {} },
    showUnitcell: false,
    representationPreset: 'auto'
  });
}

export default function MolstarViewer({ viewerId, structureId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;

    async function init() {
      const existing = pluginRegistry.get(viewerId);
      const plugin =
        existing ??
        (await createPluginUI({
          target: hostRef.current!,
          render: renderReact18,
          spec: DefaultPluginUISpec()
        }));

      if (!existing) {
        pluginRegistry.set(viewerId, plugin);
      }

      if (disposed) {
        plugin.dispose();
        return;
      }

      await loadStructure(plugin, structureId, viewerId);
    }

    void init();

    return () => {
      disposed = true;
    };
  }, [structureId, viewerId]);

  useEffect(() => {
    return () => {
      const plugin = pluginRegistry.get(viewerId);
      if (plugin) {
        plugin.dispose();
        pluginRegistry.delete(viewerId);
      }
    };
  }, [viewerId]);

  return <div ref={hostRef} className="h-[70vh] w-full overflow-hidden rounded border border-slate-200" />;
}
