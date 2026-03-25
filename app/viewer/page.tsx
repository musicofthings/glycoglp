'use client';

import { ChangeEvent, useEffect } from 'react';
import ControlsPanel from '@/components/ControlsPanel';
import MolstarViewer from '@/components/MolstarViewer';
import SequencePanel from '@/components/SequencePanel';
import { useViewerStore } from '@/lib/state';

const VIEWER_IDS = ['viewer-a', 'viewer-b'];
const DEMOS = ['example1', 'example2', 'glyco_demo'];

export default function ViewerPage() {
  const viewers = useViewerStore((s) => s.viewers);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setStructureId = useViewerStore((s) => s.setStructureId);
  const setUploadedPdb = useViewerStore((s) => s.setUploadedPdb);

  useEffect(() => {
    VIEWER_IDS.forEach((viewerId) => ensureViewer(viewerId));
  }, [ensureViewer]);

  const onUpload = (viewerId: string) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadedPdb(viewerId, text);
  };

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <h1 className="text-2xl font-semibold">Glyco-Aware Molecular Viewer</h1>
        <p className="text-sm text-slate-600">
          Mol* viewer with sequence↔structure sync, glycosite detection, and glycan rendering controls.
        </p>

        <ControlsPanel viewerIds={VIEWER_IDS} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {VIEWER_IDS.map((viewerId) => {
            const viewer = viewers[viewerId];
            const structureId = viewer?.structureId ?? 'example1';

            return (
              <section key={viewerId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <header className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-slate-700">{viewerId}</h2>
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    value={structureId.startsWith('upload-') ? '' : structureId}
                    onChange={(e) => setStructureId(viewerId, e.target.value)}
                  >
                    {DEMOS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <label className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                    Upload PDB/mmCIF
                    <input className="hidden" type="file" accept=".pdb,.cif,.mmcif,.ent,.txt" onChange={onUpload(viewerId)} />
                  </label>
                  {!structureId.startsWith('upload-') && (
                    <a
                      className="text-xs font-medium text-blue-600 hover:underline"
                      href={`/api/structure?id=${structureId}`}
                      download={`${structureId}.pdb`}
                    >
                      Download PDB
                    </a>
                  )}
                </header>

                <MolstarViewer viewerId={viewerId} structureId={structureId} />
                <SequencePanel viewerId={viewerId} structureId={structureId} />
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
