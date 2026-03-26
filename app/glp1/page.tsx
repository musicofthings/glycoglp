import Link from 'next/link';

// ── Static pipeline data ────────────────────────────────────────────────────

const GATE_RESULTS = [
  {
    gate:      1,
    name:      'Masking Feasibility',
    criterion: '≥50% SASA suppression, binding not zeroed',
    in:        50,
    pass:      26,
    out:       10,
    notes:     'Only biantennary-class glycans pass; monosaccharide / O-linked core-1 serve as negative controls.',
  },
  {
    gate:      2,
    name:      'Linker Timing',
    criterion: 't½ ∈ [1–6 h], delayed activation confirmed',
    in:        20,
    pass:      16,
    out:       5,
    notes:     'Simple esters (t½ <1 h) eliminated. Hydrazone borderline (t½ 6.5 h). PABC/disulfide/carbonate pass.',
  },
  {
    gate:      3,
    name:      'Receptor Activation',
    criterion: '≥70% predicted efficacy, unmasked binding ≥0.60',
    in:        50,
    pass:      48,
    out:       3,
    notes:     'Y25W aromatic gain + A8T DPP-4 resistance drive top candidates above 100% efficacy.',
  },
  {
    gate:      4,
    name:      'Temporal PK Model',
    criterion: 'Late/early ratio ≥3× baseline (~3.15)',
    in:        3,
    pass:      3,
    out:       3,
    notes:     'All three achieve late/early ratio of 5.58× vs baseline 1.05. All pass.',
  },
];

const CANDIDATES = [
  {
    rank:      1,
    id:        'GLP1-GM-F54D54',
    demoId:    'glp1_gm_f54d54',
    sequence:  'HTEGTFTSDVSAYLQGQAWKEAIAWLVKGR',
    glycan:    'Biantennary sialylated N-glycan (SA₂Gal₂GlcNAc₂Man₃GlcNAc₂)',
    glycanPos: 'Glu9 (O-linked via A8T→Thr anchor)',
    linker:    'Cathepsin B-cleavable GFLG tetrapeptide',
    halfLife:  5.72,
    mutations: [
      { code: 'A8T',  note: 'Creates Thr anchor for O-glycosylation; DPP-4 resistance' },
      { code: 'S18A', note: 'Helix stabilisation; additional DPP-4 resistance' },
      { code: 'E21Q', note: 'Neutral amide; improved helical propensity' },
      { code: 'Y25W', note: 'Trp aromatic stacking with GLP-1R ECD; binding gain' },
      { code: 'G28A', note: 'Helix C-cap methylation; mild stability gain' },
    ],
    metrics: {
      sasa:     82.5,
      efficacy: 102.7,
      ratio:    5.58,
      score:    0.7940,
      mw:       5762,
    },
    activation: [0.000, 0.221, 0.329, 0.494, 0.667, 0.774, 0.824, 0.863],
    rationale:
      'Highest composite score driven by Y25W receptor gain (+7% binding) and strongest masking. ' +
      'Cathepsin B cleavage in endosomal compartment ensures spatially confined, delayed activation.',
    synthesisFirst: true,
  },
  {
    rank:      2,
    id:        'GLP1-GM-942303',
    demoId:    'glp1_gm_942303',
    sequence:  'HTEGTFTSDVSAYLQGQAWKEFIAWLVKGR',
    glycan:    'Biantennary sialylated N-glycan',
    glycanPos: 'Glu9 (O-linked via A8T→Thr anchor)',
    linker:    'Cathepsin B-cleavable GFLG tetrapeptide',
    halfLife:  5.72,
    mutations: [
      { code: 'A8T',  note: 'O-glycosylation anchor; DPP-4 resistance' },
      { code: 'S18A', note: 'Helix stabilisation' },
      { code: 'E21Q', note: 'Neutral amide; improved helical propensity' },
      { code: 'Y25W', note: 'Trp aromatic contact with GLP-1R' },
    ],
    metrics: {
      sasa:     82.5,
      efficacy: 101.1,
      ratio:    5.58,
      score:    0.7844,
      mw:       5838,
    },
    activation: [0.000, 0.221, 0.329, 0.494, 0.667, 0.774, 0.824, 0.863],
    rationale:
      'Near-identical profile to Rank 1 but without the G28A cap mutation. ' +
      'Slightly higher MW; serves as synthetic control to isolate G28A contribution.',
    synthesisFirst: false,
  },
  {
    rank:      3,
    id:        'GLP1-GM-E562AD',
    demoId:    'glp1_gm_e562ad',
    sequence:  'HTEGTFTSDVSAYLQGQAAIEFIAWLVKGR',
    glycan:    'Biantennary sialylated N-glycan',
    glycanPos: 'Glu9 (O-linked via A8T→Thr anchor)',
    linker:    'Cathepsin B-cleavable GFLG tetrapeptide',
    halfLife:  5.72,
    mutations: [
      { code: 'A8T',  note: 'O-glycosylation anchor' },
      { code: 'S18A', note: 'Helix stabilisation' },
      { code: 'E21Q', note: 'Neutral amide' },
      { code: 'L26I', note: 'Conservative Leu→Ile; branched chain maintains hydrophobicity' },
    ],
    metrics: {
      sasa:     82.5,
      efficacy: 92.8,
      ratio:    5.58,
      score:    0.7472,
      mw:       5708,
    },
    activation: [0.000, 0.221, 0.329, 0.494, 0.667, 0.774, 0.824, 0.863],
    rationale:
      'Lower efficacy (92.8%) due to absence of Y25W gain; L26I conservative change has minimal effect. ' +
      'Useful as a lower-efficacy control to validate the nausea-reduction hypothesis independently of receptor activation.',
    synthesisFirst: false,
  },
];

// Approximate baseline GLP-1 (no masking, immediate activation, decaying over 24h)
const BASELINE_ACTIVATION = [0.95, 0.93, 0.91, 0.87, 0.81, 0.73, 0.67, 0.55];
const TIME_LABELS = ['0h', '0.5h', '1h', '2h', '4h', '8h', '12h', '24h'];

// ── SVG activation curve component (server-side) ────────────────────────────

const CHART_W = 360;
const CHART_H = 160;
const PAD = { top: 8, right: 10, bottom: 28, left: 36 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

function toSvgPoints(values: number[]): string {
  return values
    .map((v, i) => {
      const x = PAD.left + (i / (values.length - 1)) * INNER_W;
      const y = PAD.top + (1 - v) * INNER_H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function ActivationChart({ candidate }: { candidate: number[] }) {
  const baselinePoints = toSvgPoints(BASELINE_ACTIVATION);
  const candPoints     = toSvgPoints(candidate);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      aria-label="Activation curve"
      role="img"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => {
        const y = PAD.top + (1 - v) * INNER_H;
        return (
          <g key={v}>
            <line
              x1={PAD.left} y1={y}
              x2={PAD.left + INNER_W} y2={y}
              stroke="#e2e8f0" strokeWidth="1"
            />
            <text
              x={PAD.left - 4} y={y + 3.5}
              textAnchor="end" fontSize="9" fill="#94a3b8"
            >
              {Math.round(v * 100)}%
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <polyline
        points={baselinePoints}
        fill="none"
        stroke="#f97316"
        strokeWidth="1.8"
        strokeDasharray="5,3"
      />
      {/* Candidate */}
      <polyline
        points={candPoints}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2"
      />

      {/* X axis labels */}
      {TIME_LABELS.map((label, i) => {
        const x = PAD.left + (i / (TIME_LABELS.length - 1)) * INNER_W;
        return (
          <text
            key={label}
            x={x} y={CHART_H - 4}
            textAnchor="middle" fontSize="8" fill="#94a3b8"
          >
            {label}
          </text>
        );
      })}

      {/* Legend */}
      <line x1={PAD.left + 4} y1={PAD.top - 1} x2={PAD.left + 20} y2={PAD.top - 1}
        stroke="#f97316" strokeWidth="1.5" strokeDasharray="4,2" />
      <text x={PAD.left + 24} y={PAD.top + 3} fontSize="8" fill="#78716c">Baseline GLP-1</text>

      <line x1={PAD.left + 100} y1={PAD.top - 1} x2={PAD.left + 116} y2={PAD.top - 1}
        stroke="#2563eb" strokeWidth="2" />
      <text x={PAD.left + 120} y={PAD.top + 3} fontSize="8" fill="#1d4ed8">Glyco-masked</text>
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Glp1Page() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">

        {/* Header */}
        <header className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold">GLP-1 Glyco-Masking Program</h1>
          <p className="max-w-3xl text-slate-600">
            Full results of the 5-agent, 5-phase in silico pipeline. Objective: design GLP-1 analogs that
            preserve ≥70% receptor activation while reducing early receptor accessibility (nausea proxy)
            via covalent glycan masking and a cleavable linker.
          </p>
        </header>

        {/* Phase / Gate summary */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Phase Gate Results</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Gate</th>
                  <th className="px-4 py-3">Phase</th>
                  <th className="px-4 py-3">Criterion</th>
                  <th className="px-4 py-3 text-center">In</th>
                  <th className="px-4 py-3 text-center">Pass</th>
                  <th className="px-4 py-3 text-center">Kept</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {GATE_RESULTS.map((g, i) => (
                  <tr key={g.gate} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-green-700">G{g.gate} ✓</td>
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{g.criterion}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">{g.in}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-green-700">{g.pass}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs font-bold">{g.out}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{g.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Candidates */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Synthesis-Ready Candidates</h2>
          <div className="flex flex-col gap-6">
            {CANDIDATES.map((c) => (
              <article
                key={c.id}
                className={`rounded-xl border bg-white p-6 shadow-sm ${
                  c.synthesisFirst
                    ? 'border-blue-300 ring-2 ring-blue-100'
                    : 'border-slate-200'
                }`}
              >
                {/* Header row */}
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${
                        c.synthesisFirst
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Rank {c.rank}
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-700">{c.id}</span>
                    {c.synthesisFirst && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        Synthesize First
                      </span>
                    )}
                  </div>
                  <Link
                    href="/viewer"
                    className="rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    View in Mol*
                  </Link>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {/* Sequence + mutations */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Sequence &amp; Mutations
                    </h3>
                    <div className="mb-3 overflow-x-auto rounded bg-slate-50 p-2 font-mono text-xs leading-relaxed">
                      {c.sequence}
                    </div>
                    <ul className="space-y-1 text-xs">
                      {c.mutations.map((m) => (
                        <li key={m.code} className="flex gap-2">
                          <code className="shrink-0 rounded bg-blue-50 px-1 font-bold text-blue-700">
                            {m.code}
                          </code>
                          <span className="text-slate-600">{m.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Design details + metrics */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Design
                    </h3>
                    <dl className="mb-3 space-y-1 text-xs">
                      <div>
                        <dt className="inline text-slate-400">Glycan: </dt>
                        <dd className="inline text-slate-700">{c.glycan}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-400">Position: </dt>
                        <dd className="inline text-slate-700">{c.glycanPos}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-400">Linker: </dt>
                        <dd className="inline text-slate-700">{c.linker}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-400">t½: </dt>
                        <dd className="inline text-slate-700">{c.halfLife} h</dd>
                      </div>
                    </dl>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'SASA supp.', value: `${c.metrics.sasa}%`,     good: true },
                        { label: 'Efficacy',   value: `${c.metrics.efficacy}%`, good: true },
                        { label: 'Late/Early', value: `${c.metrics.ratio}×`,    good: true },
                        { label: 'Score',      value: c.metrics.score.toFixed(4), good: true },
                        { label: 'MW (est.)',  value: `${c.metrics.mw} Da`,     good: false },
                      ].map((m) => (
                        <div key={m.label} className="rounded bg-slate-50 p-2 text-center">
                          <div className="text-xs text-slate-400">{m.label}</div>
                          <div className={`text-sm font-bold ${m.good ? 'text-slate-800' : 'text-slate-600'}`}>
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Activation curve + rationale */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Activation Profile
                    </h3>
                    <ActivationChart candidate={c.activation} />
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">{c.rationale}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* vs Baseline comparison */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Comparison vs Baseline GLP-1</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Molecule</th>
                  <th className="px-3 py-2">SASA suppression</th>
                  <th className="px-3 py-2">Early activation (0–2 h)</th>
                  <th className="px-3 py-2">Late activation (2–24 h)</th>
                  <th className="px-3 py-2">Late/Early ratio</th>
                  <th className="px-3 py-2">Nausea risk</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-orange-50">
                  <td className="px-3 py-2 font-medium">Baseline GLP-1</td>
                  <td className="px-3 py-2">0%</td>
                  <td className="px-3 py-2">~95%</td>
                  <td className="px-3 py-2">~90%</td>
                  <td className="px-3 py-2 font-mono">1.05</td>
                  <td className="px-3 py-2 font-medium text-red-600">HIGH</td>
                </tr>
                {CANDIDATES.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{c.id}</td>
                    <td className="px-3 py-2">{c.metrics.sasa}%</td>
                    <td className="px-3 py-2">~{Math.round(c.activation[3] * 100)}% at 2 h</td>
                    <td className="px-3 py-2">~{Math.round(c.activation[4] * 100)}% at 4 h</td>
                    <td className="px-3 py-2 font-mono font-bold text-blue-700">{c.metrics.ratio}×</td>
                    <td className="px-3 py-2 font-medium text-green-600">LOW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/viewer"
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Visualize in Mol* Viewer
          </Link>
          <Link
            href="/"
            className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Home
          </Link>
        </div>

      </div>
    </main>
  );
}
