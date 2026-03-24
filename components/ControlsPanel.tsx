'use client';

import { type ColorMode, type RepresentationMode, useViewerStore } from '@/lib/state';

type Props = { viewerIds: string[] };

const representations: RepresentationMode[] = ['cartoon', 'surface', 'ball-and-stick'];
const colorModes: ColorMode[] = ['uniform', 'chain-id', 'confidence'];

export default function ControlsPanel({ viewerIds }: Props) {
  const viewers = useViewerStore((s) => s.viewers);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setRepresentation = useViewerStore((s) => s.setRepresentation);
  const setColorMode = useViewerStore((s) => s.setColorMode);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-3 text-sm font-semibold">Viewer Controls</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {viewerIds.map((id) => {
          const state = viewers[id];
          if (!state) ensureViewer(id);

          return (
            <div key={id} className="rounded border border-slate-200 bg-white p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{id}</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {representations.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRepresentation(id, mode)}
                    className={`rounded px-2 py-1 text-xs ${state?.representation === mode ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {colorModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setColorMode(id, mode)}
                    className={`rounded px-2 py-1 text-xs ${state?.colorMode === mode ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
