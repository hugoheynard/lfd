import {
  EmplacementNameRequiredError,
  EmplacementNotFoundError,
  EmplacementTableNotFoundError,
} from '../domain/errors/locations-errors.js';
import {
  EmplacementRepository,
  type EmplacementRecord,
} from '../domain/ports/emplacement.repository.js';
import type { TableState } from '../domain/value-objects/table.js';

/** Gardes/dérivations **partagées** par les handlers emplacement — pas de règle propre. */
export function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new EmplacementNameRequiredError();
  }
  return trimmed;
}

export async function requireEmplacement(
  emplacements: EmplacementRepository,
  id: string,
): Promise<EmplacementRecord> {
  const emplacement = await emplacements.findById(id);
  if (emplacement === null) {
    throw new EmplacementNotFoundError(id);
  }
  return emplacement;
}

export function requireTable(
  emplacement: EmplacementRecord,
  tableNumber: number,
): TableState {
  const table = emplacement.tables.find((t) => t.number === tableNumber);
  if (table === undefined) {
    throw new EmplacementTableNotFoundError(emplacement.id, tableNumber);
  }
  return table;
}
