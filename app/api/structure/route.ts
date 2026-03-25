import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const ALLOWED = new Set(['example1', 'example2', 'glyco_demo']);

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? 'example1';
  if (!ALLOWED.has(id)) {
    return new NextResponse('Unknown structure id', { status: 404 });
  }

  const fileUrl = new URL(`/structures/${id}.pdb`, request.url);
  const fileResponse = await fetch(fileUrl);

  if (!fileResponse.ok) {
    return new NextResponse('Structure file not found', { status: 404 });
  }

  const data = await fileResponse.text();

  return new NextResponse(data, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `inline; filename="${id}.pdb"`
    }
  });
}
