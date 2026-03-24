'use client';

import { create } from 'zustand';

export type RepresentationMode = 'cartoon' | 'surface' | 'ball-and-stick';
export type ColorMode = 'uniform' | 'chain-id' | 'confidence';

export type MutationAnnotation = {
  position: number;
  from: string;
  to: string;
};

export type StructureAnnotations = {
  highlighted: number[];
  mutations: MutationAnnotation[];
};

type ViewerState = {
  selectedResidue: number | null;
  hoveredResidue: number | null;
  structureId: string;
  representation: RepresentationMode;
  colorMode: ColorMode;
  annotations: StructureAnnotations;
};

type StoreState = {
  viewers: Record<string, ViewerState>;
  ensureViewer: (viewerId: string) => void;
  setSelectedResidue: (viewerId: string, residue: number | null) => void;
  setHoveredResidue: (viewerId: string, residue: number | null) => void;
  setRepresentation: (viewerId: string, representation: RepresentationMode) => void;
  setColorMode: (viewerId: string, colorMode: ColorMode) => void;
  setAnnotations: (viewerId: string, annotations: StructureAnnotations) => void;
};

const defaultViewerState = (viewerId: string): ViewerState => ({
  selectedResidue: null,
  hoveredResidue: null,
  structureId: viewerId,
  representation: 'cartoon',
  colorMode: 'uniform',
  annotations: { highlighted: [], mutations: [] }
});

export const useViewerStore = create<StoreState>((set, get) => ({
  viewers: {},
  ensureViewer: (viewerId) => {
    if (get().viewers[viewerId]) return;
    set((state) => ({
      viewers: { ...state.viewers, [viewerId]: defaultViewerState(viewerId) }
    }));
  },
  setSelectedResidue: (viewerId, residue) =>
    set((state) => ({
      viewers: {
        ...state.viewers,
        [viewerId]: { ...state.viewers[viewerId], selectedResidue: residue }
      }
    })),
  setHoveredResidue: (viewerId, residue) =>
    set((state) => ({
      viewers: {
        ...state.viewers,
        [viewerId]: { ...state.viewers[viewerId], hoveredResidue: residue }
      }
    })),
  setRepresentation: (viewerId, representation) =>
    set((state) => ({
      viewers: {
        ...state.viewers,
        [viewerId]: { ...state.viewers[viewerId], representation }
      }
    })),
  setColorMode: (viewerId, colorMode) =>
    set((state) => ({
      viewers: {
        ...state.viewers,
        [viewerId]: { ...state.viewers[viewerId], colorMode }
      }
    })),
  setAnnotations: (viewerId, annotations) =>
    set((state) => ({
      viewers: {
        ...state.viewers,
        [viewerId]: { ...state.viewers[viewerId], annotations }
      }
    }))
}));
