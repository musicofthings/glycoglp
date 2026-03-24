import { NextRequest, NextResponse } from 'next/server';

const annotationsById = {
  example1: {
    highlighted: [5, 12, 18, 22],
    mutations: [
      { position: 12, from: 'N', to: 'Y' },
      { position: 18, from: 'V', to: 'A' }
    ]
  },
  example2: {
    highlighted: [2, 7, 14],
    mutations: [{ position: 7, from: 'L', to: 'F' }]
  }
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') as keyof typeof annotationsById;
  const payload = annotationsById[id] ?? annotationsById.example1;

  return NextResponse.json(payload);
}
