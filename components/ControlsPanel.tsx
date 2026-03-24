'use client';

import { type ColorMode, type GlycanRepresentation, type RepresentationMode, useViewerStore } from '@/lib/state';

type Props = { viewerIds: string[] };

const representations: RepresentationMode[] = ['cartoon', 'surface', 'ball-and-stick'];
const colorModes: ColorMode[] = ['uniform', 'chain-id', 'confidence'];
const glycanModes: GlycanRepresentation[] = ['stick', 'sphere'];

export default function ControlsPanel({ viewerIds }: Props) {
  const viewers = useViewerStore((s) => s.viewers);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setRepresentation = useViewerStore((s) => s.setRepresentation);
  const setColorMode = useViewerStore((s) => s.setColorMode);
  const setShowGlycans = useViewerStore((s) => s.setShowGlycans);
  const setGlycanOnly = useViewerStore((s) => s.setGlycanOnly);
  const setHighlightGlycosites = useViewerStore((s) => s.setHighlightGlycosites);
  const setGlycanRepresentation = useViewerStore((s) => s.setGlycanRepresentation);

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
              <div className="mb-2 flex flex-wrap gap-2">
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
              <div className="mb-2 flex flex-wrap gap-2">
                {glycanModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGlycanRepresentation(id, mode)}
                    className={`rounded px-2 py-1 text-xs ${state?.glycanRepresentation === mode ? 'bg-violet-600 text-white' : 'bg-slate-100'}`}
                  >
                    glycan {mode}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(state?.showGlycans)}
                    onChange={(e) => setShowGlycans(id, e.target.checked)}
                  />
                  Show glycans
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(state?.glycanOnly)}
                    onChange={(e) => setGlycanOnly(id, e.target.checked)}
                  />
                  Glycan-only
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={Boolean(state?.highlightGlycosites)}
                    onChange={(e) => setHighlightGlycosites(id, e.target.checked)}
                  />
                  Highlight glycosites
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
