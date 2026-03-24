# Mol* Peptide/Protein Viewer (Next.js)

Production-oriented Next.js App Router project for visualizing peptide/protein structures with Mol* and synchronized sequence interactions.

## Features

- Mol* viewer per structure panel
- Sequence strip rendered from PDB `CA` residues
- Bidirectional sync via shared Zustand state:
  - sequence click updates selected residue in viewer state
  - 3D click updates selected residue in sequence
- Annotation overlays (`highlighted` + `mutations`) from API
- Representation and color controls per viewer
- Multi-viewer side-by-side layout
- Lightweight API routes serving structure files and annotation JSON

## Tech Stack

- Next.js (App Router)
- TypeScript + React
- Tailwind CSS
- Zustand
- Mol* (`molstar`)

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/viewer`.

## Build

```bash
npm run build
npm run start
```

## API Endpoints

- `GET /api/structure?id=example1`
  - Returns a PDB file from `public/structures`
- `GET /api/annotations?id=example1`
  - Returns annotation JSON like:

```json
{
  "highlighted": [5, 12, 18],
  "mutations": [{ "position": 12, "from": "N", "to": "Y" }]
}
```

## Included test structures

- `example1.pdb` (small CA-trace inspired by 1CRN)
- `example2.pdb` (small peptide CA-trace)

