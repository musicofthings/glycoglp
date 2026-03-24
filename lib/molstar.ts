'use client';

import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { StructureElement } from 'molstar/lib/mol-model/structure';

export function getAuthSeqIdFromLoci(loci: unknown): number | null {
  if (!StructureElement.Loci.is(loci) || loci.elements.length === 0) return null;

  const first = loci.elements[0];
  const unit = first.unit;
  const residueIndex = unit.model.atomicHierarchy.residueAtomSegments.index[first.indices[0]];
  const value = unit.model.atomicHierarchy.residues.auth_seq_id.value(residueIndex);

  return Number.isFinite(value) ? value : null;
}

export async function resetRepresentation(plugin: PluginUIContext) {
  await plugin.managers.structure.component.clear();
  await plugin.managers.structure.hierarchy.removeAll();
}
