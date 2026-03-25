import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

type Source = 'demo' | 'rcsb' | 'alphafold' | 'pdbe';

const ALLOWED_DEMOS = new Set(['example1', 'example2', 'glyco_demo']);

function cleanId(value: string): string {
  return value.trim();
}

function getRemoteUrl(source: Source, id: string): string | null {
  if (source === 'rcsb') {
    if (!/^[A-Za-z0-9]{4}$/.test(id)) return null;
    return `https://files.rcsb.org/download/${id.toUpperCase()}.pdb`;
  }

  if (source === 'alphafold') {
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return `https://alphafold.ebi.ac.uk/files/AF-${id.toUpperCase()}-F1-model_v4.pdb`;
  }

  if (source === 'pdbe') {
    if (!/^[A-Za-z0-9]{4}$/.test(id)) return null;
    return `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${id.toLowerCase()}.ent`;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const source = (request.nextUrl.searchParams.get('source') ?? 'demo') as Source;
  const id = cleanId(request.nextUrl.searchParams.get('id') ?? 'example1');

  if (source === 'demo') {
    if (!ALLOWED_DEMOS.has(id)) {
      return new NextResponse('Unknown structure id', { status: 404 });
    }

    const fileUrl = new URL(`/structures/${id}.pdb`, request.url);
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      return new NextResponse('Structure file not found', { status: 404 });
    }

    return new NextResponse(await fileResponse.text(), {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `inline; filename="${id}.pdb"`
      }
    });
  }

  const remoteUrl = getRemoteUrl(source, id);
  if (!remoteUrl) {
    return new NextResponse('Invalid structure source or identifier', { status: 400 });
  }

  const remoteResponse = await fetch(remoteUrl, {
    headers: {
      'user-agent': 'glycoglp-viewer/1.0'
    }
  });

  if (!remoteResponse.ok) {
    return new NextResponse(`Unable to fetch structure (${source}:${id})`, { status: 404 });
  }

  return new NextResponse(await remoteResponse.text(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `inline; filename="${source}-${id}.pdb"`
    }
  });
}
