import ControlsPanel from '@/components/ControlsPanel';
import MolstarViewer from '@/components/MolstarViewer';
import SequencePanel from '@/components/SequencePanel';

const STRUCTURES = ['example1', 'example2'];

export default function ViewerPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <h1 className="text-2xl font-semibold">Interactive Molecular Viewer</h1>
        <p className="text-sm text-slate-600">
          Mol* viewer with bidirectional sequence/structure residue synchronization and annotations.
        </p>

        <ControlsPanel viewerIds={STRUCTURES} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {STRUCTURES.map((id) => (
            <section key={id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <header className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide text-slate-700">{id}</h2>
                <a
                  className="text-xs font-medium text-blue-600 hover:underline"
                  href={`/api/structure?id=${id}`}
                  download={`${id}.pdb`}
                >
                  Download PDB
                </a>
              </header>

              <MolstarViewer structureId={id} />
              <SequencePanel structureId={id} />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
