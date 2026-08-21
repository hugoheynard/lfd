import { TvaRegimeNotFoundError, TvaTagConflictError } from "../domain/errors/commerce-errors.js";
import type { TvaRegime } from "../domain/entities/tva-regime.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";

/**
 * Les gardes que l'agrégat ne peut pas tenir : elles regardent les AUTRES
 * régimes. La dérivation du `tag`, elle, a rejoint le VO `TvaRate` — c'était
 * une règle de domaine qui vivait dans la couche application.
 */

/** Refuse un `tag` déjà porté par un **autre** régime (même taux ⇒ même handle). */
export async function ensureTagFree(
  regimes: TvaRegimeRepository,
  tag: string,
  exceptId: string | null,
): Promise<void> {
  const existing = await regimes.findByTag(tag);
  if (existing !== null && existing.id !== exceptId) {
    throw new TvaTagConflictError(tag);
  }
}

export async function requireRegime(regimes: TvaRegimeRepository, id: string): Promise<TvaRegime> {
  const regime = await regimes.findById(id);
  if (regime === null) {
    throw new TvaRegimeNotFoundError(id);
  }
  return regime;
}
