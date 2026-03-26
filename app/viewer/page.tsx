'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import MolstarViewer from '@/components/MolstarViewer';
import { buildStructureApiUrl, getStructureDownloadName } from '@/lib/structureSource';
import { useViewerStore } from '@/lib/state';

const VIEWER_IDS = ['viewer-a', 'viewer-b'];
const DEMOS = [
  { label: '4Z18 (PD-L1, RCSB)', value: 'rcsb:4Z18' },
  { label: 'example1 (demo)', value: 'demo:example1' },
  { label: 'example2 (demo)', value: 'demo:example2' },
  { label: 'glyco_demo (demo)', value: 'demo:glyco_demo' },
  // ── GLP-1 Glyco-Masking Program ──
  { label: 'GLP-1 Reference (unmasked)', value: 'demo:glp1_reference' },
  { label: '[Rank 1] GLP1-GM-F54D54 — sialylated + GFLG, 82.5% SASA supp', value: 'demo:glp1_gm_f54d54' },
  { label: '[Rank 2] GLP1-GM-942303 — sialylated + GFLG, 101% efficacy',    value: 'demo:glp1_gm_942303' },
  { label: '[Rank 3] GLP1-GM-E562AD — sialylated + GFLG, 92.8% efficacy',   value: 'demo:glp1_gm_e562ad' },
];

type SearchSource = 'rcsb' | 'alphafold';

type SearchResult = {
  id: string;
  label: string;
  source: SearchSource;
};

function getDefaultStructureId(viewerId: string): string {
  return viewerId.endsWith('b') ? 'demo:glyco_demo' : 'rcsb:4Z18';
}

export default function ViewerPage() {
  const viewers = useViewerStore((s) => s.viewers);
  const ensureViewer = useViewerStore((s) => s.ensureViewer);
  const setStructureId = useViewerStore((s) => s.setStructureId);
  const setUploadedPdb = useViewerStore((s) => s.setUploadedPdb);

  const [searchSourceByViewer, setSearchSourceByViewer] = useState<Record<string, SearchSource>>({
    'viewer-a': 'rcsb',
    'viewer-b': 'rcsb'
  });
  const [searchByViewer, setSearchByViewer] = useState<Record<string, string>>({ 'viewer-a': 'PD-L1', 'viewer-b': '4Z18' });
  const [resultsByViewer, setResultsByViewer] = useState<Record<string, SearchResult[]>>({ 'viewer-a': [], 'viewer-b': [] });
  const [loadingByViewer, setLoadingByViewer] = useState<Record<string, boolean>>({ 'viewer-a': false, 'viewer-b': false });

  useEffect(() => {
    VIEWER_IDS.forEach((viewerId) => ensureViewer(viewerId));
  }, [ensureViewer]);

  useEffect(() => {
    VIEWER_IDS.forEach((viewerId) => {
      const viewer = viewers[viewerId];
      if (!viewer?.structureId) {
        setStructureId(viewerId, getDefaultStructureId(viewerId));
      }
    });
  }, [setStructureId, viewers]);

  const onUpload = (viewerId: string) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadedPdb(viewerId, text);
  };

  const runSearch = async (viewerId: string) => {
    const q = (searchByViewer[viewerId] ?? '').trim();
    if (!q) return;

    setLoadingByViewer((prev) => ({ ...prev, [viewerId]: true }));

    try {
      const source = searchSourceByViewer[viewerId];
      const response = await fetch(`/api/structure-search?source=${source}&q=${encodeURIComponent(q)}`);
      const payload = (await response.json()) as { results: SearchResult[] };
      setResultsByViewer((prev) => ({ ...prev, [viewerId]: payload.results ?? [] }));
    } finally {
      setLoadingByViewer((prev) => ({ ...prev, [viewerId]: false }));
    }
  };

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Glyco-Aware Molecular Viewer</h1>
            <p className="text-sm text-slate-600">
              Mol* viewer with sequence↔structure sync, glycosite detection, and glycan rendering controls.
            </p>
          </div>
          <a
            href="https://molstar.org/viewer-docs/"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Open original Mol* viewer documentation"
          >
            Mol* How-To Docs
          </a>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {VIEWER_IDS.map((viewerId) => {
            const viewer = viewers[viewerId];
            const structureId = viewer?.structureId ?? getDefaultStructureId(viewerId);

            return (
              <section key={viewerId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <header className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-slate-700">{viewerId}</h2>
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                    value={structureId.startsWith('upload-') ? '' : structureId}
                    onChange={(e) => setStructureId(viewerId, e.target.value)}
                    title="Load a built-in demo or curated starting structure"
                  >
                    {DEMOS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <label className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" title="Upload a local PDB or mmCIF file">
                    Upload PDB/mmCIF
                    <input className="hidden" type="file" accept=".pdb,.cif,.mmcif,.ent,.txt" onChange={onUpload(viewerId)} />
                  </label>
                  {!structureId.startsWith('upload-') && (
                    <a
                      className="text-xs font-medium text-blue-600 hover:underline"
                      href={buildStructureApiUrl(structureId)}
                      download={getStructureDownloadName(structureId)}
                      title="Download the currently selected structure"
                    >
                      Download Structure
                    </a>
                  )}
                </header>

                <div className="mb-2 rounded border border-slate-200 p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Structure Search</p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={searchSourceByViewer[viewerId]}
                      onChange={(e) =>
                        setSearchSourceByViewer((prev) => ({ ...prev, [viewerId]: e.target.value as SearchSource }))
                      }
                      title="Select protein database source"
                    >
                      <option value="rcsb">RCSB PDB</option>
                      <option value="alphafold">AlphaFold DB</option>
                    </select>
                    <input
                      className="min-w-[200px] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      value={searchByViewer[viewerId] ?? ''}
                      onChange={(e) => setSearchByViewer((prev) => ({ ...prev, [viewerId]: e.target.value }))}
                      placeholder={searchSourceByViewer[viewerId] === 'rcsb' ? 'PD-L1, kinase, antibody...' : 'UniProt accession or gene'}
                      title="Search structures in the selected database"
                    />
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      onClick={() => void runSearch(viewerId)}
                      title="Search database and list structures"
                    >
                      {loadingByViewer[viewerId] ? 'Searching…' : 'Search'}
                    </button>
                  </div>
                  {resultsByViewer[viewerId]?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {resultsByViewer[viewerId].map((result) => (
                        <button
                          key={`${result.source}-${result.id}`}
                          type="button"
                          className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                          onClick={() => setStructureId(viewerId, `${result.source}:${result.id}`)}
                          title={`Load ${result.label}`}
                        >
                          {result.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <MolstarViewer viewerId={viewerId} structureId={structureId} />
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
