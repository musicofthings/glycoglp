'use client';

import { useEffect, useRef, useState } from 'react';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { presetStaticComponent } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { loadStructureText, parseStructureRef } from '@/lib/structureSource';
import { detectGlycosylationSites } from '@/lib/glycan';
import { useViewerStore } from '@/lib/state';
import type { ColorMode, RepresentationMode } from '@/lib/state';

type Props = { viewerId: string; structureId: string };
type MolPlugin = Awaited<ReturnType<typeof createPluginUI>>;

// ── Molstar type-name helpers ────────────────────────────────────────────────

function toMolRepType(mode: RepresentationMode): string {
  switch (mode) {
    case 'surface':        return 'molecular-surface';
    case 'ball-and-stick': return 'ball-and-stick';
    default:               return 'cartoon';
  }
}

function toMolColorTheme(mode: ColorMode): string {
  switch (mode) {
    case 'chain-id':   return 'chain-id';
    case 'confidence': return 'plddt-confidence';
    default:           return 'uniform';
  }
}

// ── Core builder ─────────────────────────────────────────────────────────────
// Clears the scene, fetches the structure text, and rebuilds all components
// with representations derived from the current Zustand viewer state.
//
// `token` is a shared object { id, current } where `id` is this build's
// generation and `current` is always the latest.  Any await that finds
// id !== current exits immediately — a newer build has taken over.
async function applyStructure(
  plugin:      MolPlugin,
  structureId: string,
  viewerId:    string,
  token:       { id: number; current: number },
  onReady:     () => void,
) {
  await plugin.clear();
  if (token.id !== token.current) return;

  const text = await loadStructureText(structureId, viewerId);
  if (token.id !== token.current) return;
  if (!text.trim()) { onReady(); return; }

  // Best-effort annotation fetch (glycan sites, mutations, highlights)
  try {
    const { id } = parseStructureRef(structureId);
    const resp   = await fetch(`/api/annotations?id=${encodeURIComponent(id)}`);
    const ann    = resp.ok ? (await resp.json() as Record<string, unknown>) : null;
    const detected = detectGlycosylationSites(text);
    if (token.id === token.current) {
      useViewerStore.getState().setAnnotations(viewerId, {
        highlighted:   (ann?.highlighted   as number[]  ?? []),
        mutations:     (ann?.mutations     as never[]   ?? []),
        glycosylation: (ann?.glycosylation as never[]   ?? []).length
          ? (ann!.glycosylation as never[])
          : detected,
      });
    }
  } catch { /* annotations are best-effort */ }

  if (token.id !== token.current) return;

  // Parse & load structure
  const format    = text.trimStart().startsWith('data_') ? 'mmcif' : 'pdb';
  const rawData   = await plugin.builders.data.rawData({ data: text, label: structureId });
  const traj      = await plugin.builders.structure.parseTrajectory(rawData, format);
  const model     = await plugin.builders.structure.createModel(traj);
  const structure = await plugin.builders.structure.createStructure(model, {
    name: 'model',
    params: {},
  });

  if (token.id !== token.current) return;

  // Read current display settings from Zustand
  const vs          = useViewerStore.getState().viewers[viewerId];
  const rep         = vs?.representation       ?? 'cartoon';
  const col         = vs?.colorMode            ?? 'uniform';
  const showGlycans = vs?.showGlycans ?? true;

  const reprBuilder = plugin.builders.structure.representation;

  // ── Create ALL components first, then build the update ───────────────────
  // CRITICAL ORDER: plugin.state.data.build() captures a snapshot of the
  // current state tree.  Any component committed AFTER the builder is created
  // won't be visible to builder.to(ref) — it throws "Could not find node".
  // Solution: await all presetStaticComponent calls BEFORE calling build().
  // (This is exactly what the official Molstar polymer-and-ligand preset does:
  //  it calls reprBuilder() — which wraps plugin.state.data.build() — only
  //  after every presetStaticComponent await has resolved.)

  const polymerComp  = await presetStaticComponent(plugin, structure, 'polymer');
  if (token.id !== token.current) return;

  const branchedComp = showGlycans
    ? await presetStaticComponent(plugin, structure, 'branched')
    : undefined;
  if (token.id !== token.current) return;

  // Ligand component (chain B GFLG linker) intentionally not created:
  // creating it and leaving it without a representation still adds it to
  // Molstar's state tree and can produce stray ball-and-stick geometry via
  // Molstar's internal default-representation logic.  Skip entirely.
  if (token.id !== token.current) return;

  // Build the state-tree update AFTER all components have been committed.
  const update = plugin.state.data.build();

  // Molstar's buildRepresentation `type`/`color` params use internal string
  // literal unions not re-exported as usable public types — pragmatic cast.
  /* eslint-disable @typescript-eslint/no-explicit-any */

  // ── Polymer backbone → cartoon (or user-selected representation) ──────────
  if (polymerComp) {
    reprBuilder.buildRepresentation(update, polymerComp, {
      type:        toMolRepType(rep) as any,
      typeParams:  rep === 'ball-and-stick' ? { sizeFactor: 0.5 } : { quality: 'auto' },
      color:       toMolColorTheme(col) as any,
      colorParams: col === 'uniform' ? { value: 0x4a90d9 } : {},
    }, { tag: 'polymer' });
  }

  if (showGlycans) {
    // ── Branched polysaccharides / glycan chains → 3D-SNFG ────────────────
    // SNFG-coloured geometric symbols (blue cube = GlcNAc, green sphere = Man,
    // yellow circle = Gal, purple diamond = Sia) connected by glycosidic-bond
    // links.  sizeFactor 0.8 matches RCSB default and makes shapes large enough
    // to visually touch the inter-residue link sticks.
    if (branchedComp) {
      reprBuilder.buildRepresentation(update, branchedComp, {
        type:        'carbohydrate' as any,
        typeParams:  { sizeFactor: 0.8 },
        color:       'carbohydrate-symbol' as any,
        colorParams: {},
      }, { tag: 'branched-snfg-3d' });
    }
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */

  await update.commit({ revertOnError: false });
  if (token.id !== token.current) return;

  plugin.managers.camera.reset();

  if (token.id === token.current) onReady();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function MolstarViewer({ viewerId, structureId }: Props) {
  const elRef    = useRef<HTMLDivElement>(null);
  const plugRef  = useRef<MolPlugin | null>(null);
  // Always holds the most-recent structureId so the async init path picks
  // it up if props changed while createPluginUI was still resolving.
  const latestId = useRef(structureId);
  latestId.current = structureId;

  // Monotonic build counter — incremented before every applyStructure call.
  // The token object is shared so applyStructure can detect cancellation.
  const tokenRef = useRef({ id: 0, current: 0 });

  const [ready, setReady] = useState(false);

  // ── Zustand subscriptions ────────────────────────────────────────────────
  // Changes here trigger re-application of representations.  applyStructure
  // reads the latest state from the store directly, so we just need to ensure
  // it re-runs when these values change.
  const rep         = useViewerStore((s) => s.viewers[viewerId]?.representation       ?? 'cartoon');
  const col         = useViewerStore((s) => s.viewers[viewerId]?.colorMode            ?? 'uniform');
  const showGlycans = useViewerStore((s) => s.viewers[viewerId]?.showGlycans          ?? true);
  const glycanRep   = useViewerStore((s) => s.viewers[viewerId]?.glycanRepresentation ?? 'stick');

  // ── Mount: create Mol* plugin exactly once ───────────────────────────────
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // Fresh inner container for each mount so ReactDOM.createRoot() never
    // receives a DOM node it already owns (React 19 strict-mode double-invoke).
    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%';
    el.appendChild(container);

    let live    = true;
    let pending: MolPlugin | undefined;

    tokenRef.current.current++;
    const tok = { id: tokenRef.current.current, current: tokenRef.current.current };
    // Point tok.current at the shared counter so applyStructure sees future increments
    Object.defineProperty(tok, 'current', { get: () => tokenRef.current.current });

    createPluginUI({ target: container, render: renderReact18, spec: DefaultPluginUISpec() })
      .then((p) => {
        pending = p;
        if (!live) { p.dispose(); return; }
        plugRef.current = p;
        return applyStructure(p, latestId.current, viewerId, tok, () => setReady(true));
      })
      .catch(console.error);

    return () => {
      live = false;
      tokenRef.current.current++; // invalidate any in-flight build
      const p = plugRef.current ?? pending;
      plugRef.current = null;
      p?.dispose();
      container.remove();
      setReady(false);
    };
    // Empty deps — plugin lifecycle is bound to DOM mount only.
    // viewerId is stable per component instance in this app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload when the selected structure changes ───────────────────────────
  useEffect(() => {
    const p = plugRef.current;
    if (!p) return; // init still in-flight; the .then() path uses latestId
    tokenRef.current.current++;
    const id  = tokenRef.current.current;
    const tok = { id, get current() { return tokenRef.current.current; } };
    setReady(false);
    void applyStructure(p, structureId, viewerId, tok, () => setReady(true));
  }, [structureId, viewerId]);

  // ── Reapply when display settings change ────────────────────────────────
  // applyStructure reads the latest settings from the store directly, so we
  // just need to rebuild using the current structureId.
  useEffect(() => {
    const p = plugRef.current;
    if (!p) return;
    tokenRef.current.current++;
    const id  = tokenRef.current.current;
    const tok = { id, get current() { return tokenRef.current.current; } };
    setReady(false);
    void applyStructure(p, latestId.current, viewerId, tok, () => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, col, showGlycans, glycanRep]);

  return (
    <div
      ref={elRef}
      className="relative h-[70vh] w-full overflow-hidden rounded border border-slate-200"
    >
      {/* Loading overlay — covers the blank Mol* chrome while the plugin
          initialises or while structure data is being fetched/parsed.
          pointer-events-none lets users click into the Mol* viewport beneath,
          which handles its own loading indicator for large remote structures. */}
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/85 backdrop-blur-sm">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
          <p className="text-xs font-medium text-slate-500">Loading structure…</p>
        </div>
      )}
    </div>
  );
}
