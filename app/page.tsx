import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">GlycoGLP Molecular Viewer</h1>
          <p className="max-w-2xl text-slate-600">
            Interactive peptide/protein visualization powered by Mol*, including glycan-aware inspection,
            sequence↔structure synchronization, annotations, and side-by-side comparison.
          </p>
        </header>

        <section className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-medium">What you can do</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Load demo proteins or upload your own PDB/mmCIF files</li>
              <li>Inspect glycosylation sites and glycan representations</li>
              <li>Click sequence residues and synchronize 3D selection</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-medium">Deployment ready</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Cloudflare Pages compatible build pipeline</li>
              <li>Edge runtime API routes for structure + annotation data</li>
              <li>Multi-view mode for modified vs unmodified comparisons</li>
            </ul>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/viewer"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Open Viewer
          </Link>
          <a
            href="/api/structure?id=example1"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Download Demo Structure
          </a>
        </div>
      </div>
    </main>
  );
}
