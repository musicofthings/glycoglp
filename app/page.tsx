import Link from 'next/link';

const TOP_CANDIDATES = [
  {
    id:        'GLP1-GM-F54D54',
    rank:      1,
    sequence:  'HTEGTFTSDVSAYLQGQAWKEAIAWLVKGR',
    glycan:    'Biantennary sialylated',
    linker:    'Cathepsin B GFLG',
    mutations: 'A8T · S18A · E21Q · Y25W · G28A',
    sasa:      82.5,
    efficacy:  102.7,
    ratio:     5.58,
    score:     0.794,
    demoId:    'glp1_gm_f54d54',
  },
  {
    id:        'GLP1-GM-942303',
    rank:      2,
    sequence:  'HTEGTFTSDVSAYLQGQAWKEFIAWLVKGR',
    glycan:    'Biantennary sialylated',
    linker:    'Cathepsin B GFLG',
    mutations: 'A8T · S18A · E21Q · Y25W',
    sasa:      82.5,
    efficacy:  101.1,
    ratio:     5.58,
    score:     0.784,
    demoId:    'glp1_gm_942303',
  },
  {
    id:        'GLP1-GM-E562AD',
    rank:      3,
    sequence:  'HTEGTFTSDVSAYLQGQAAIEFIAWLVKGR',
    glycan:    'Biantennary sialylated',
    linker:    'Cathepsin B GFLG',
    mutations: 'A8T · S18A · E21Q · L26I',
    sasa:      82.5,
    efficacy:  92.8,
    ratio:     5.58,
    score:     0.747,
    demoId:    'glp1_gm_e562ad',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">

        {/* Hero */}
        <header className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Multi-Agent In Silico Program · 5 Phases · 4 Hard Gates
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight">
            GLP-1 Glyco-Masking Drug Discovery
          </h1>
          <p className="max-w-3xl text-slate-600">
            A fully in silico, 5-agent computational pipeline that designed synthesis-ready GLP-1 analogs
            with <strong>delayed receptor activation via glycan masking</strong> — reducing the nausea-associated
            early receptor hit while preserving full therapeutic efficacy post-cleavage.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/glp1"
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              View Program Results
            </Link>
            <Link
              href="/viewer"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Open Mol* Viewer
            </Link>
          </div>
        </header>

        {/* Pipeline overview */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Pipeline Overview</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { phase: '1', name: 'Masking Feasibility', gate: '50 → 10', icon: '🔬' },
              { phase: '2', name: 'Linker Timing',       gate: '20 → 5',  icon: '⏱' },
              { phase: '3', name: 'Receptor Activation', gate: '50 → 3',  icon: '🧬' },
              { phase: '4', name: 'Temporal PK',         gate: '3 → 3',   icon: '📈' },
              { phase: '5', name: 'Final Selection',     gate: 'top 3',   icon: '🏆' },
            ].map((p) => (
              <div key={p.phase} className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <div className="text-xl">{p.icon}</div>
                <div className="mt-1 text-xs font-bold text-green-700">Phase {p.phase}</div>
                <div className="text-xs font-medium text-slate-700">{p.name}</div>
                <div className="mt-1 rounded bg-green-100 px-1 py-0.5 text-xs font-mono text-green-800">
                  {p.gate} ✓
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Top candidates */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Top Synthesis Candidates</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {TOP_CANDIDATES.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  c.rank === 1
                    ? 'border-blue-300 ring-2 ring-blue-100'
                    : 'border-slate-200'
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      c.rank === 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Rank {c.rank}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{c.id}</span>
                </div>

                <div className="mb-3 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-xs leading-relaxed text-slate-700">
                  {c.sequence}
                </div>

                <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <dt className="text-slate-400">SASA suppression</dt>
                    <dd className="font-semibold text-slate-800">{c.sasa}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Predicted efficacy</dt>
                    <dd className="font-semibold text-slate-800">{c.efficacy}%</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Late/Early ratio</dt>
                    <dd className="font-semibold text-slate-800">{c.ratio}×</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Composite score</dt>
                    <dd className="font-semibold text-slate-800">{c.score}</dd>
                  </div>
                </dl>

                <div className="mb-3 space-y-1 text-xs text-slate-500">
                  <div><span className="font-medium text-slate-600">Glycan:</span> {c.glycan} @ Glu9</div>
                  <div><span className="font-medium text-slate-600">Linker:</span> {c.linker} · t½ 5.72 h</div>
                  <div><span className="font-medium text-slate-600">Mutations:</span> {c.mutations}</div>
                </div>

                <Link
                  href="/viewer"
                  className="block rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-center text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  Visualize in Mol*
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Feature grid */}
        <section className="grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-semibold">5-Agent Architecture</h3>
            <ul className="space-y-1.5 text-slate-600">
              {[
                'Planner — phased execution plans + compute budgets',
                'Generator — 50→10→5→3 candidate funnel',
                'Evaluator — Shrake-Rupley SASA + ODE PK/PD model',
                'Scorer — weighted composite (masking·timing·binding·stability)',
                'Controller — hard gates with automatic pruning',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-semibold">Mol* Glyco-Aware Viewer</h3>
            <ul className="space-y-1.5 text-slate-600">
              {[
                'Side-by-side comparison of reference vs candidate',
                'Glycan residue detection (NAG · MAN · GAL · SIA)',
                'Glycosite highlighting with annotation tooltips',
                'Sequence↔structure synchronization',
                'Upload your own PDB/mmCIF files',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-violet-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

      </div>
    </main>
  );
}
