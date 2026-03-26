import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const annotationsById = {
  example1: {
    highlighted: [5, 12, 18, 22],
    mutations: [
      { position: 12, from: 'N', to: 'Y' },
      { position: 18, from: 'V', to: 'A' }
    ],
    glycosylation: []
  },
  example2: {
    highlighted: [2, 7, 14],
    mutations: [{ position: 7, from: 'L', to: 'F' }],
    glycosylation: []
  },
  glyco_demo: {
    highlighted: [45, 46],
    mutations: [{ position: 45, from: 'N', to: 'N' }],
    glycosylation: [
      {
        position: 45,
        type: 'N-linked',
        confidence: 0.92,
        chain: 'A',
        glycanResidues: ['NAG', 'MAN', 'GAL']
      }
    ]
  },
  // ── GLP-1 Glyco-Masking Program ──────────────────────────────────────────
  // Unmodified GLP-1(7-36) reference — no glycan, no linker
  glp1_reference: {
    highlighted: [7, 8, 9, 10, 11, 12, 13, 14],   // activation domain residues 7-14
    mutations: [],
    glycosylation: []
  },
  // Rank 1: GLP1-GM-F54D54 — biantennary sialylated @ Glu9 + cathepsin GFLG linker
  // Mutations: A8T, S18A, E21Q, Y25W, G28A
  // SASA suppression 82.5%, efficacy 102.7%, late/early ratio 5.58×
  glp1_gm_f54d54: {
    highlighted: [7, 8, 9, 10, 11, 12, 13, 14],
    mutations: [
      { position: 8,  from: 'A', to: 'T' },
      { position: 18, from: 'S', to: 'A' },
      { position: 21, from: 'E', to: 'Q' },
      { position: 25, from: 'Y', to: 'W' },
      { position: 28, from: 'G', to: 'A' },
    ],
    glycosylation: [
      {
        position: 9,
        type: 'O-linked',
        confidence: 0.91,
        chain: 'A',
        glycanResidues: ['NAG', 'NAG', 'MAN', 'MAN', 'MAN', 'GAL', 'GAL', 'SIA', 'SIA', 'GAL', 'GAL'],
        linker: 'cathepsin_GFLG',
        linkerHalfLifeH: 5.72,
        sasaSuppression: 82.5,
        predictedEfficacyPct: 102.7,
        lateEarlyRatio: 5.58,
        finalScore: 0.7940,
        rank: 1,
      }
    ]
  },
  // Rank 2: GLP1-GM-942303 — biantennary sialylated @ Glu9 + cathepsin GFLG
  // Mutations: A8T, S18A, E21Q, Y25W
  // SASA suppression 82.5%, efficacy 101.1%, late/early ratio 5.58×
  glp1_gm_942303: {
    highlighted: [7, 8, 9, 10, 11, 12, 13, 14],
    mutations: [
      { position: 8,  from: 'A', to: 'T' },
      { position: 18, from: 'S', to: 'A' },
      { position: 21, from: 'E', to: 'Q' },
      { position: 25, from: 'Y', to: 'W' },
    ],
    glycosylation: [
      {
        position: 9,
        type: 'O-linked',
        confidence: 0.89,
        chain: 'A',
        glycanResidues: ['NAG', 'NAG', 'MAN', 'MAN', 'MAN', 'GAL', 'GAL', 'SIA', 'SIA', 'GAL', 'GAL'],
        linker: 'cathepsin_GFLG',
        linkerHalfLifeH: 5.72,
        sasaSuppression: 82.5,
        predictedEfficacyPct: 101.1,
        lateEarlyRatio: 5.58,
        finalScore: 0.7844,
        rank: 2,
      }
    ]
  },
  // Rank 3: GLP1-GM-E562AD — biantennary sialylated @ Glu9 + cathepsin GFLG
  // Mutations: A8T, S18A, E21Q, L26I
  // SASA suppression 82.5%, efficacy 92.8%, late/early ratio 5.58×
  glp1_gm_e562ad: {
    highlighted: [7, 8, 9, 10, 11, 12, 13, 14],
    mutations: [
      { position: 8,  from: 'A', to: 'T' },
      { position: 18, from: 'S', to: 'A' },
      { position: 21, from: 'E', to: 'Q' },
      { position: 26, from: 'L', to: 'I' },
    ],
    glycosylation: [
      {
        position: 9,
        type: 'O-linked',
        confidence: 0.85,
        chain: 'A',
        glycanResidues: ['NAG', 'NAG', 'MAN', 'MAN', 'MAN', 'GAL', 'GAL', 'SIA', 'SIA', 'GAL', 'GAL'],
        linker: 'cathepsin_GFLG',
        linkerHalfLifeH: 5.72,
        sasaSuppression: 82.5,
        predictedEfficacyPct: 92.8,
        lateEarlyRatio: 5.58,
        finalScore: 0.7472,
        rank: 3,
      }
    ]
  },
};

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get('id') ?? 'example1';
  const [, parsedId = rawId] = rawId.split(':');
  const id = parsedId as keyof typeof annotationsById;
  const payload = annotationsById[id] ?? { highlighted: [], mutations: [], glycosylation: [] };

  return NextResponse.json(payload);
}
