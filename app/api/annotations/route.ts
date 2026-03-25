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
  }
};

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get('id') ?? 'example1';
  const [, parsedId = rawId] = rawId.split(':');
  const id = parsedId as keyof typeof annotationsById;
  const payload = annotationsById[id] ?? { highlighted: [], mutations: [], glycosylation: [] };

  return NextResponse.json(payload);
}
