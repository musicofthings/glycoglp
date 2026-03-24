import { useViewerStore } from '@/lib/state';

export async function loadStructureText(structureId: string, viewerId: string): Promise<string> {
  if (structureId === `upload-${viewerId}`) {
    return useViewerStore.getState().uploadedPdbByViewer[viewerId] ?? '';
  }

  const response = await fetch(`/api/structure?id=${structureId}`);
  return response.text();
}
