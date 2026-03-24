import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';

const ALLOWED = new Set(['example1', 'example2', 'glyco_demo']);

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? 'example1';
  if (!ALLOWED.has(id)) {
    return new NextResponse('Unknown structure id', { status: 404 });
  }

  const filePath = join(process.cwd(), 'public', 'structures', `${id}.pdb`);
  const data = await readFile(filePath, 'utf8');

  return new NextResponse(data, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `inline; filename="${id}.pdb"`
    }
  });
}
