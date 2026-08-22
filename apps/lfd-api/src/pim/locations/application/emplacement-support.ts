import { EmplacementNotFoundError } from "../domain/errors/locations-errors.js";
import type { Emplacement } from "../domain/entities/emplacement.js";
import { EmplacementRepository } from "../domain/ports/emplacement.repository.js";

/**
 * Charge un emplacement, ou refuse. Le seul partage qui reste ici : `cleanName`
 * et `requireTable` ont rejoint l'agrégat, qui est le lieu de ces règles.
 */
export async function requireEmplacement(
  emplacements: EmplacementRepository,
  id: string,
): Promise<Emplacement> {
  const emplacement = await emplacements.findById(id);
  if (emplacement === null) {
    throw new EmplacementNotFoundError(id);
  }
  return emplacement;
}
