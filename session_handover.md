# GlycoGLP — Session Handover

**Date:** 2026-03-29
**Branch:** `main` (fully synced, `origin/main` up to date)
**Repo:** https://github.com/musicofthings/glycoglp

---

## What This Project Is

GlycoGLP is a Next.js 15 in-silico drug discovery platform for GLP-1 glyco-masking research.
Core feature: side-by-side Molstar 4.18.0 viewer comparing the unmodified GLP-1(7-36) helix against ranked glyco-masked analogs, with 3D-SNFG carbohydrate rendering and glycosite highlighting.

**Stack:** Next.js 15 · TypeScript · Molstar 4.18.0 · Zustand · Tailwind CSS · esbuild

---

## Work Completed This Session

### Problem Solved
Molstar viewer was showing "disconnected sticks and dots" instead of a proper:
- Alpha-helix cartoon ribbon (RCSB style)
- 3D-SNFG glycan tree (colored geometric symbols connected by link cylinders)

### Root Causes Identified and Fixed

#### 1. Glycan topology not detected (primary fix)
**File:** `scripts/gen-structures.mjs`
**Cause:** Inter-residue glycosidic bonds were encoded as `CONECT` records. Molstar converts PDB `LINK` records → internal `struct_conn` table → carbohydrate topology graph. `CONECT` alone is insufficient; without `struct_conn` each sugar was treated as an independent ligand, producing no connecting cylinders between SNFG symbols.
**Fix:** Added `linkRecord()` function emitting properly-formatted PDB LINK records (78 cols + padding). LINK records are now written **before** the ATOM section (PDB spec section 5, before section 8), matching the wwPDB v3.3 ordering requirement.

#### 2. Ligand component creating stray geometry (secondary fix)
**File:** `components/MolstarViewer.tsx`
**Cause:** `presetStaticComponent(plugin, structure, 'ligand')` was called and the component left without a representation. Despite no explicit `buildRepresentation` call, the component still lived in Molstar's state tree and risked default-rendering the GFLG linker (chain B) as ball-and-stick sticks.
**Fix:** Removed the `presetStaticComponent` call for `'ligand'` entirely — don't create what you don't want rendered.

#### 3. Dead code removed
| Item | File | Why removed |
|------|------|-------------|
| `pyranoseRing()` (XY-plane ring) | `gen-structures.mjs` | Superseded by `pyranoseRingXZ()` |
| `conectRecord()` | `gen-structures.mjs` | Superseded by `linkRecord()` |
| `glycanSerials` Map | `gen-structures.mjs` | Was populated but never consumed after CONECT block deleted |
| `GlycanRepresentation` import | `MolstarViewer.tsx` | Unused after ligand rendering removed |
| `glycanType` / `glycanRep` in `applyStructure` | `MolstarViewer.tsx` | Only needed for the removed ligand rendering |

#### 4. SNFG symbol size
**Was:** `sizeFactor: 0.35` — shapes appeared as tiny dots visually disconnected from the 5 Å inter-residue link cylinders.
**Fixed to:** `sizeFactor: 0.8` — matches RCSB/official Molstar default, shapes large enough to visually touch connecting sticks.

#### 5. Viewer-B default structure flash
**File:** `app/viewer/page.tsx`
Viewer-B was briefly flashing `glp1_reference` before Zustand hydrated. Fixed: viewer-b now resolves to `demo:glp1_gm_f54d54` on first paint.

---

## Key Architecture: PDB File Generator

**File:** `scripts/gen-structures.mjs`
**Run:** `node scripts/gen-structures.mjs`
**Output:** `public/structures/glp1_reference.pdb`, `glp1_gm_f54d54.pdb`, `glp1_gm_942303.pdb`, `glp1_gm_e562ad.pdb`, `example1.pdb`, `example2.pdb`

### PDB Structure Layout (per file)
```
HEADER / TITLE / REMARK
SEQRES
HELIX   ← full GLP-1(7-36) as right-handed alpha helix (class 1)
LINK    ← glycosidic bonds (8 records, before ATOM section) ← CRITICAL
ATOM    ← chain A: GLP-1(7-36) backbone (N, CA, C, O, CB)
TER
HETATM  ← chain B: GFLG linker (not rendered in viewer, present in PDB)
TER
HETATM  ← chain C: biantennary sialylated N-glycan (9 residues)
TER
END
```

### Glycan Chain (chain C, residues 501–509)
```
NAG(501) → NAG(502) → MAN(503)
                         ├─α1,3→ MAN(504) → GAL(506) → SIA(508)
                         └─α1,6→ MAN(505) → GAL(507) → SIA(509)
```
SNFG colors: NAG=blue cube, MAN=green sphere, GAL=yellow circle, SIA=purple diamond

### Ring Geometry (`pyranoseRingXZ`)
- Ring in **XZ plane** (X=radial, Z=tangential, Y=vertical/chair-puckering)
- Ring angles: C1=0°, C2=60°, C3=120°, C4=180°, C5=240°, O5=300°
- Chair: C1/C3/C5 at +0.25 Å in Y; C2/C4/O5 at −0.25 Å
- Ring radius: 1.42 Å

### Glycan Positioning (`glycanChain(glycanResIdx)`)
- Anchored at helix residue `glycanResIdx` (0-based)
- Radial vector from helix axis: `eᵣ = (cos φ, 0, sin φ)` where `φ = glycanResIdx × 100°`
- Tangential vector: `eₜ = (−sin φ, 0, cos φ)` (used for left/right branching)
- Stem grows radially outward: `pos(dr, dY, dt=0)` → `cx = caX + dr·erX + dt·etX`

### LINK Record Format (`linkRecord()`)
PDB column layout verified against wwPDB v3.3 spec (78 chars + 2 padding):
```
cols  1- 6: "LINK  "
cols  7-12: spaces
cols 13-16: atom name 1
col  17:    altLoc1
cols 18-20: resName1
col  21:    space
col  22:    chainID1
cols 23-26: resSeq1
col  27:    iCode1
cols 28-42: spaces (15)
cols 43-46: atom name 2
col  47:    altLoc2
cols 48-50: resName2
col  51:    space
col  52:    chainID2
cols 53-56: resSeq2
col  57:    iCode2
cols 58-59: spaces
cols 60-65: sym1 "  1555"
col  66:    space
cols 67-72: sym2 "  1555"
col  73:    space
cols 74-78: distance (right-justified, 2 decimal places)
```

---

## Key Architecture: Molstar Viewer

**File:** `components/MolstarViewer.tsx`

### Component Order (CRITICAL — do not change)
```typescript
// 1. Create ALL components BEFORE calling plugin.state.data.build()
const polymerComp  = await presetStaticComponent(plugin, structure, 'polymer');
const branchedComp = showGlycans ? await presetStaticComponent(plugin, structure, 'branched') : undefined;
// NOTE: 'ligand' component is intentionally NOT created

// 2. THEN build the update
const update = plugin.state.data.build();

// 3. Build representations
reprBuilder.buildRepresentation(update, polymerComp, { type: 'cartoon', ... });
reprBuilder.buildRepresentation(update, branchedComp, { type: 'carbohydrate', sizeFactor: 0.8, color: 'carbohydrate-symbol' });

// 4. Commit
await update.commit({ revertOnError: false });
```

### Why `as any` casts exist
Molstar's `buildRepresentation` `type` and `color` parameters use internal string literal unions not re-exported as public type aliases. The four casts (`toMolRepType(rep) as any`, `toMolColorTheme(col) as any`, `'carbohydrate' as any`, `'carbohydrate-symbol' as any`) are scoped with `eslint-disable/enable` blocks and a comment explaining the reason.

---

## Known Limitations / Future Work

| Issue | Notes |
|-------|-------|
| Synthetic PDB geometry | The GLP-1 helix and glycan are mathematically generated, not from crystallography or MD. The O4–C1 inter-sugar bond distance is ~5.8 Å (unrealistic), but Molstar honors `LINK` records regardless of distance for rendering purposes. |
| Glycan partially occluded from default camera | At glycanPos=2 (phi≈100°), the stem grows nearly along +Z (toward camera). Rotate 90° around Y to see full biantennary tree. Could be improved by choosing a glycosite at phi≈0° or 180° for better side-on view. |
| GFLG linker present but invisible | Chain B HETATM data is in PDB files but the ligand component is never created in the viewer. If future work needs to show it, add `presetStaticComponent(plugin, structure, 'ligand')` back and add a `buildRepresentation` call for it. |
| `as any` Molstar casts | Will resolve naturally if Molstar exports public representation/color type aliases in a future version. |
| No automated tests | Manual integration tests only (v1.0 philosophy). |

---

## Dev Commands

```bash
# Install
npm install

# Dev server (port 3001)
npm run dev -- -p 3001

# Production build (typecheck + lint)
npm run build

# Regenerate all PDB files
node scripts/gen-structures.mjs

# View structure file
cat public/structures/glp1_reference.pdb | grep -E "LINK|HELIX|HETATM.*NAG"
```

---

## Commits This Session

```
a4ed312  Fix viewer-b default structure and sync lockfile
513385e  Fix glycan SNFG connectivity: add PDB LINK records, remove dead code
```

Both on `main`, pushed to `origin/main`.
