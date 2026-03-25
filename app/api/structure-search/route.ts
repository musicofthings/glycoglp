import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

type SearchResult = {
  id: string;
  label: string;
  source: 'rcsb' | 'alphafold';
};

async function searchRcsb(query: string, limit: number): Promise<SearchResult[]> {
  const body = {
    query: {
      type: 'terminal',
      service: 'text',
      parameters: {
        value: query
      }
    },
    request_options: {
      return_all_hits: false,
      pager: {
        start: 0,
        rows: limit
      }
    },
    return_type: 'entry'
  };

  const response = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as { result_set?: Array<{ identifier: string }> };
  return (payload.result_set ?? []).map((result) => ({
    id: result.identifier,
    label: `RCSB ${result.identifier}`,
    source: 'rcsb'
  }));
}

async function searchAlphaFold(query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch(
    `https://alphafold.ebi.ac.uk/api/search?q=${encodeURIComponent(query)}`,
    { headers: { accept: 'application/json' } }
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as Array<{ entryId?: string; uniprotAccession?: string; gene?: string }>;

  return payload.slice(0, limit).map((item) => {
    const accession = item.uniprotAccession ?? item.entryId ?? query;
    return {
      id: accession,
      label: `AlphaFold ${accession}${item.gene ? ` (${item.gene})` : ''}`,
      source: 'alphafold'
    };
  });
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const source = request.nextUrl.searchParams.get('source') ?? 'rcsb';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 8), 20);

  if (!q) return NextResponse.json({ results: [] as SearchResult[] });

  let results: SearchResult[] = [];
  if (source === 'alphafold') {
    results = await searchAlphaFold(q, limit);
  } else {
    results = await searchRcsb(q, limit);
  }

  return NextResponse.json({ results });
}
