import { useViewerStore } from '@/lib/state';

export type StructureSource = 'demo' | 'rcsb' | 'alphafold' | 'pdbe';

export type StructureRef = {
  source: StructureSource;
  id: string;
};

export function parseStructureRef(structureId: string): StructureRef {
  const [candidateSource, ...rest] = structureId.split(':');
  const source = candidateSource as StructureSource;

  if (rest.length > 0 && ['demo', 'rcsb', 'alphafold', 'pdbe'].includes(source)) {
    return {
      source,
      id: rest.join(':')
    };
  }

  return { source: 'demo', id: structureId };
}

export function buildStructureApiUrl(structureId: string): string {
  const ref = parseStructureRef(structureId);
  const params = new URLSearchParams({ id: ref.id, source: ref.source });
  return `/api/structure?${params.toString()}`;
}

export function getStructureDownloadName(structureId: string): string {
  const ref = parseStructureRef(structureId);
  return `${ref.source}-${ref.id}.pdb`;
}

export async function loadStructureText(structureId: string, viewerId: string): Promise<string> {
  if (structureId === `upload-${viewerId}`) {
    return useViewerStore.getState().uploadedPdbByViewer[viewerId] ?? '';
  }

  const response = await fetch(buildStructureApiUrl(structureId));
  return response.text();
}
