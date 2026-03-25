'use client';

import { OrderedSet } from 'molstar/lib/mol-data/int';
import { StructureElement } from 'molstar/lib/mol-model/structure';

export function getAuthSeqIdFromLoci(loci: unknown): number | null {
  if (!StructureElement.Loci.is(loci) || loci.elements.length === 0) return null;

  const first = loci.elements[0];
  const unit = first.unit;
  const firstAtomIndex = OrderedSet.getAt(first.indices, 0);
  const residueIndex = unit.model.atomicHierarchy.residueAtomSegments.index[firstAtomIndex];
  const value = unit.model.atomicHierarchy.residues.auth_seq_id.value(residueIndex);

  return Number.isFinite(value) ? value : null;
}
