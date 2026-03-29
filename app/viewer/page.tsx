'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import MolstarViewer from '@/components/MolstarViewer';
import ControlsPanel from '@/components/ControlsPanel';
import SequencePanel from '@/components/SequencePanel';
import { buildStructureApiUrl, getStructureDownloadName } from '@/lib/structureSource';
import { useViewerStore } from '@/lib/state';

const VIEWER_IDS = ['viewer-a', 'viewer-b'] as const;

const DEMOS = [
  { label: '── GLP-1 Glyco-Masking ──────────', value: '', disabled: true },
  { label: 'GLP-1 Reference (unmasked)',          value: 'demo:glp1_reference' },
  { label: '[Rank 1] GLP1-GM-F54D54 · 82.5% SASA · 102.7% efficacy', value: 'demo:glp1_gm_f54d54' },
  { label: '[Rank 2] GLP1-GM-942303 · 82.5% SASA · 101.1% efficacy', value: 'demo:glp1_gm_942303' },
  { label: '[Rank 3] GLP1-GM-E562AD · 82.5% SASA · 92.8% efficacy',  value: 'demo:glp1_gm_e562ad' },
  { label: '── Other Demos ──────────────────', value: '', disabled: true },
  { label: 'Glyco Demo (demo)',                   value: 'demo:glyco_demo' },
  { label: 'Example 1 (demo)',                    value: 'demo:example1' },
  { label: 'Example 2 (demo)',                    value: 'demo:example2' },
  { label: '── Remote ───────────────────────', value: '', disabled: true },
  { label: '4Z18 (PD-L1, RCSB)',                  value: 'rcsb:4Z18' },
];

// Preset compare pairs that load structures into both viewers simultaneously
const COMPARE_PRESETS = [
  { label: 'Ref vs Rank 1',  a: 'demo:glp1_reference', b: 'demo:glp1_gm_f54d54' },
  { label: 'Rank 1 vs Rank 2', a: 'demo:glp1_gm_f54d54', b: 'demo:glp1_gm_942303' },
  { label: 'Rank 1 vs Rank 3', a: 'demo:glp1_gm_f54d54', b: 'demo:glp1_gm_e562ad' },
];

type SearchSource = 'rcsb' | 'alphafold';
type SearchResult = { id: string; label: string; source: SearchSource };

export default function ViewerPage() {
  const viewers         = useViewerStore((s) => s.viewers);
  const ensureViewer    = useViewerStore((s) => s.ensureViewer);
  const setStructureId  = useViewerStore((s) => s.setStructureId);
  const setUploadedPdb  = useViewerStore((s) => s.setUploadedPdb);

  const [searchSource, setSearchSource] = useState<Record<string, SearchSource>>({
    'viewer-a': 'rcsb',
    'viewer-b': 'rcsb',
  });
  const [query,   setQuery]   = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    VIEWER_IDS.forEach((id) => ensureViewer(id));
  }, [ensureViewer]);

  const onUpload = (viewerId: string) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPdb(viewerId, await file.text());
  };

  const runSearch = async (viewerId: string) => {
    const q = (query[viewerId] ?? '').trim();
    if (!q) return;
    setLoading((p) => ({ ...p, [viewerId]: true }));
    try {
      const src = searchSource[viewerId];
      const res = await fetch(`/api/structure-search?source=${src}&q=${encodeURIComponent(q)}`);
      const payload = (await res.json()) as { results: SearchResult[] };
      setResults((p) => ({ ...p, [viewerId]: payload.results ?? [] }));
    } finally {
      setLoading((p) => ({ ...p, [viewerId]: false }));
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">

        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Glyco-Aware Mol* Viewer</h1>
            <p className="text-sm text-slate-500">
              Side-by-side structure comparison with glycan detection, sequence annotation, and glycosite highlighting.
            </p>
          </div>
          <a
            href="https://molstar.org/viewer-docs/"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Mol* Docs
          </a>
        </div>

        {/* GLP-1 Quick Compare */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            GLP-1 Glyco-Masking — Quick Compare
          </p>
          <div className="flex flex-wrap gap-2">
            {COMPARE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setStructureId('viewer-a', p.a);
                  setStructureId('viewer-b', p.b);
                }}
                className="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shared controls */}
        <ControlsPanel viewerIds={[...VIEWER_IDS]} />

        {/* Two viewer panels */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {VIEWER_IDS.map((viewerId) => {
            const viewer     = viewers[viewerId];
            // Mirror defaultViewerState defaults so viewer-b shows the glyco-masked
            // candidate from first paint rather than flashing glp1_reference briefly.
            const defaultId   = viewerId.endsWith('b') ? 'demo:glp1_gm_f54d54' : 'demo:glp1_reference';
            const structureId = viewer?.structureId ?? defaultId;

            return (
              <section
                key={viewerId}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                {/* Panel header */}
                <header className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                    {viewerId}
                  </span>

                  <select
                    className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                    value={structureId.startsWith('upload-') ? '' : structureId}
                    onChange={(e) => {
                      if (e.target.value) setStructureId(viewerId, e.target.value);
                    }}
                    title="Load a demo or curated structure"
                  >
                    {DEMOS.map((d, i) => (
                      <option
                        key={`${d.value}-${i}`}
                        value={d.value}
                        disabled={d.disabled}
                      >
                        {d.label}
                      </option>
                    ))}
                  </select>

                  <label
                    className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    title="Upload a local PDB or mmCIF file"
                  >
                    Upload
                    <input
                      className="hidden"
                      type="file"
                      accept=".pdb,.cif,.mmcif,.ent,.txt"
                      onChange={onUpload(viewerId)}
                    />
                  </label>

                  {!structureId.startsWith('upload-') && (
                    <a
                      className="text-xs font-medium text-blue-600 hover:underline"
                      href={buildStructureApiUrl(structureId)}
                      download={getStructureDownloadName(structureId)}
                      title="Download structure file"
                    >
                      Download
                    </a>
                  )}
                </header>

                {/* Search */}
                <details className="rounded border border-slate-200">
                  <summary className="cursor-pointer rounded px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                    Search external databases
                  </summary>
                  <div className="border-t border-slate-100 p-3">
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        value={searchSource[viewerId]}
                        onChange={(e) =>
                          setSearchSource((p) => ({ ...p, [viewerId]: e.target.value as SearchSource }))
                        }
                      >
                        <option value="rcsb">RCSB PDB</option>
                        <option value="alphafold">AlphaFold DB</option>
                      </select>
                      <input
                        className="min-w-[160px] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                        value={query[viewerId] ?? ''}
                        onChange={(e) => setQuery((p) => ({ ...p, [viewerId]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && void runSearch(viewerId)}
                        placeholder={
                          searchSource[viewerId] === 'rcsb'
                            ? 'PD-L1, kinase…'
                            : 'UniProt accession'
                        }
                      />
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        onClick={() => void runSearch(viewerId)}
                      >
                        {loading[viewerId] ? 'Searching…' : 'Search'}
                      </button>
                    </div>
                    {results[viewerId]?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {results[viewerId].map((r) => (
                          <button
                            key={`${r.source}-${r.id}`}
                            type="button"
                            className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                            onClick={() => setStructureId(viewerId, `${r.source}:${r.id}`)}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>

                {/* Mol* viewer */}
                <MolstarViewer viewerId={viewerId} structureId={structureId} />

                {/* Sequence panel */}
                <SequencePanel viewerId={viewerId} structureId={structureId} />
              </section>
            );
          })}
        </div>

      </div>
    </main>
  );
}
