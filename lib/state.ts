'use client';

import { create } from 'zustand';

export type RepresentationMode = 'cartoon' | 'surface' | 'ball-and-stick';
export type ColorMode = 'uniform' | 'chain-id' | 'confidence';
export type GlycanRepresentation = 'stick' | 'sphere';

export type MutationAnnotation = {
  position: number;
  from: string;
  to: string;
};

export type GlycoAnnotation = {
  position: number;
  type: 'N-linked' | 'O-linked' | 'Unknown';
  confidence?: number;
  chain?: string;
  glycanResidues?: string[];
};

export type StructureAnnotations = {
  highlighted: number[];
  mutations: MutationAnnotation[];
  glycosylation: GlycoAnnotation[];
};

type ViewerState = {
  selectedResidue: number | null;
  hoveredResidue: number | null;
  structureId: string;
  representation: RepresentationMode;
  colorMode: ColorMode;
  annotations: StructureAnnotations;
  showGlycans: boolean;
  glycanOnly: boolean;
  highlightGlycosites: boolean;
  glycanRepresentation: GlycanRepresentation;
};

type StoreState = {
  viewers: Record<string, ViewerState>;
  uploadedPdbByViewer: Record<string, string>;
  ensureViewer: (viewerId: string) => void;
  setStructureId: (viewerId: string, structureId: string) => void;
  setUploadedPdb: (viewerId: string, pdbText: string) => void;
  setSelectedResidue: (viewerId: string, residue: number | null) => void;
  setHoveredResidue: (viewerId: string, residue: number | null) => void;
  setRepresentation: (viewerId: string, representation: RepresentationMode) => void;
  setColorMode: (viewerId: string, colorMode: ColorMode) => void;
  setAnnotations: (viewerId: string, annotations: StructureAnnotations) => void;
  setShowGlycans: (viewerId: string, value: boolean) => void;
  setGlycanOnly: (viewerId: string, value: boolean) => void;
  setHighlightGlycosites: (viewerId: string, value: boolean) => void;
  setGlycanRepresentation: (viewerId: string, mode: GlycanRepresentation) => void;
};

const defaultViewerState = (viewerId: string): ViewerState => ({
  selectedResidue: null,
  hoveredResidue: null,
  structureId: viewerId.endsWith('b') ? 'glyco_demo' : 'example1',
  representation: 'cartoon',
  colorMode: 'uniform',
  annotations: { highlighted: [], mutations: [], glycosylation: [] },
  showGlycans: true,
  glycanOnly: false,
  highlightGlycosites: true,
  glycanRepresentation: 'stick'
});

function updateViewer(
  state: StoreState,
  viewerId: string,
  updater: (viewer: ViewerState) => ViewerState
): Record<string, ViewerState> {
  const viewer = state.viewers[viewerId] ?? defaultViewerState(viewerId);
  return { ...state.viewers, [viewerId]: updater(viewer) };
}

export const useViewerStore = create<StoreState>((set, get) => ({
  viewers: {},
  uploadedPdbByViewer: {},
  ensureViewer: (viewerId) => {
    if (get().viewers[viewerId]) return;
    set((state) => ({
      viewers: { ...state.viewers, [viewerId]: defaultViewerState(viewerId) }
    }));
  },
  setStructureId: (viewerId, structureId) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, structureId, selectedResidue: null }))
    })),
  setUploadedPdb: (viewerId, pdbText) =>
    set((state) => ({
      uploadedPdbByViewer: { ...state.uploadedPdbByViewer, [viewerId]: pdbText },
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, structureId: `upload-${viewerId}` }))
    })),
  setSelectedResidue: (viewerId, residue) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, selectedResidue: residue }))
    })),
  setHoveredResidue: (viewerId, residue) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, hoveredResidue: residue }))
    })),
  setRepresentation: (viewerId, representation) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, representation }))
    })),
  setColorMode: (viewerId, colorMode) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, colorMode }))
    })),
  setAnnotations: (viewerId, annotations) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, annotations }))
    })),
  setShowGlycans: (viewerId, value) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, showGlycans: value }))
    })),
  setGlycanOnly: (viewerId, value) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, glycanOnly: value }))
    })),
  setHighlightGlycosites: (viewerId, value) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, highlightGlycosites: value }))
    })),
  setGlycanRepresentation: (viewerId, mode) =>
    set((state) => ({
      viewers: updateViewer(state, viewerId, (viewer) => ({ ...viewer, glycanRepresentation: mode }))
    }))
}));
