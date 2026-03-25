# Mol* Glycopeptide Viewer (Next.js)

A production-oriented **Next.js App Router** application for interactive peptide/protein visualization with **Mol\***, including:

- original Mol* plugin interface embedded in-app,
- side-by-side structure viewers,
- upload support for local PDB/mmCIF files,
- live structure search from RCSB PDB and AlphaFold DB,
- lightweight API routes for structures + annotations.

---

## Feature Overview

### 1) Core Molecular Viewer
- Mol* plugin initialized per viewer panel using the default `DefaultPluginUISpec()` interface.
- Loads structures from API (`/api/structure?source=...&id=...`) or uploaded local files.
- Supports basic interactive navigation (rotate/zoom/pan from Mol* defaults).
- Multi-view layout for direct structural comparison.
- Uses Mol*'s native controls/sidebar workflow for structure analysis.

### 2) Annotation Layer
- API-backed annotations from `/api/annotations?id=...`.
- Supported annotation types:
  - `highlighted` residues,
  - `mutations`,
  - `glycosylation`.
- Sequence badges/tooltips reflect annotation context.

### 3) Glycan-Aware Support
- Glycan residue detection supports known residue names:
  - `NAG`, `MAN`, `BMA`, `GAL`, `FUC`, `SIA`.
- Includes heuristic fallback for non-standard 3-letter residues.
- Glycosylation site inference via nearest anchor residue in the same chain.
- Glycosylation type classification:
  - `N-linked` (anchor `ASN`),
  - `O-linked` (anchor `SER`/`THR`),
  - `Unknown`.
- Glycosylated sequence residues are visually marked with special color + badge.

### 4) File Upload + Demo Data
- Upload local `.pdb`, `.cif`, `.mmcif`, `.ent`, `.txt` files per viewer.
- Format auto-detection for uploaded text:
  - mmCIF when content starts with `data_`, otherwise PDB.
- Included demo structures for immediate loading:
  - `example1` (non-glycosylated)
  - `example2` (non-glycosylated)
  - `glyco_demo` (glycosylated demo)
- Default starting structure includes a real entry from RCSB:
  - `4Z18` (PD-L1)

### 5) External Structure Retrieval
- Search and load structures directly from:
  - **RCSB PDB** (keyword/full-text search with selectable hits),
  - **AlphaFold DB** (search and load via accession-based entries).
- API route `GET /api/structure` supports:
  - local demo source (`source=demo&id=...`),
  - RCSB fetch (`source=rcsb&id=4Z18`),
  - AlphaFold fetch (`source=alphafold&id=P0DTC2`),
  - PDBe fetch (`source=pdbe&id=4z18`).

---

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **State:** Zustand
- **3D Visualization:** Mol* (`molstar`)
- **Backend (lightweight):** Next.js API routes

---

## Project Structure

```text
app/
  api/
    annotations/route.ts
    structure/route.ts
  viewer/page.tsx
  layout.tsx
  page.tsx
components/
  ControlsPanel.tsx
  MolstarViewer.tsx
  ResidueBadge.tsx
  SequencePanel.tsx
lib/
  glycan.ts
  molstar.ts
  sequenceMapper.ts
  state.ts
  structureSource.ts
public/
  structures/
    example1.pdb
    example2.pdb
    glyco_demo.pdb
```

---

## API Endpoints

### `GET /api/structure?source=<source>&id=<id>`
Returns structure text from local demos or remote databases.

Sources:
- `demo` (local `public/structures/<id>.pdb`)
- `rcsb` (`https://files.rcsb.org/download/<id>.pdb`)
- `alphafold` (`https://alphafold.ebi.ac.uk/files/AF-<id>-F1-model_v4.pdb`)
- `pdbe` (`https://www.ebi.ac.uk/pdbe/entry-files/download/pdb<id>.ent`)

Examples:
- `/api/structure?source=demo&id=glyco_demo`
- `/api/structure?source=rcsb&id=4Z18`
- `/api/structure?source=alphafold&id=P0DTC2`

### `GET /api/structure-search?source=<source>&q=<query>`
Searches external databases and returns compact structure hit lists for UI selection.

### `GET /api/annotations?id=<id>`
Returns JSON annotations, including optional glycosylation metadata.

Example schema:

```json
{
  "highlighted": [45, 46],
  "mutations": [{ "position": 45, "from": "N", "to": "N" }],
  "glycosylation": [
    {
      "position": 45,
      "type": "N-linked",
      "confidence": 0.92,
      "chain": "A",
      "glycanResidues": ["NAG", "MAN", "GAL"]
    }
  ]
}
```

---

## Getting Started

### Install

```bash
npm install
```

### Run (Dev)

```bash
npm run dev
```

Open: `http://localhost:3000/viewer`

Home page: `http://localhost:3000/` (landing page with button to open the viewer)

Mol* usage docs: `https://molstar.org/viewer-docs/`

### Production Build

```bash
npm run build
npm run start
```

---

## Adding New Structures

### Add a server-hosted demo structure
1. Add `public/structures/<id>.pdb`.
2. Add `<id>` to `ALLOWED` in `app/api/structure/route.ts`.
3. (Optional) Add curated annotation payload in `app/api/annotations/route.ts`.

### Use ad-hoc local structures
- Upload directly from the viewer UI (no API edits required).

---


## Cloudflare Pages Deployment

This project can be deployed to **Cloudflare Pages** using the Next.js adapter workflow.

### Build command (Cloudflare Pages)

Use this as your Cloudflare Pages **Build command**:

```bash
npm run build:cloudflare
```

### Build output directory (Cloudflare Pages)

Use this as your **Build output directory**:

```
.vercel/output/static
```

### Compatibility flags (Cloudflare Pages)

Set this compatibility flag in both **Preview** and **Production** environments:

```
nodejs_compat
```

This is also declared in `wrangler.toml` as:

```toml
compatibility_flags = ["nodejs_compat"]
```

### Required scripts

The project includes:

```bash
npm run build:cloudflare
```

which executes:

```bash
npx @cloudflare/next-on-pages@1
```

For CLI deploys, you can also run:

```bash
npm run deploy:cloudflare
```

---

## Notes / Current Scope

- Glycan detection currently uses residue-name + geometric heuristics and is intended as practical viewer support, not full glycan graph reconstruction.
- The app focuses on interactive inspection and comparison workflows for glyco-engineering exploration.
