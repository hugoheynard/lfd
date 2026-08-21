import { TvaRateConflictError, TvaRegimeNotFoundError } from "../domain/errors/commerce-errors.js";
import type { TvaRegime } from "../domain/entities/tva-regime.js";
import { TvaRegimeRepository } from "../domain/ports/tva-regime.repository.js";

/**
 * Les gardes que l'agrégat ne peut pas tenir : elles regardent les AUTRES
 * régimes.
 */

/** Refuse un taux déjà porté par un **autre** régime. */
export async function ensureRateFree(
  regimes: TvaRegimeRepository,
  percent: number,
  exceptId: string | null,
): Promise<void> {
  const existing = await regimes.findByPercent(percent);
  if (existing !== null && existing.id !== exceptId) {
    throw new TvaRateConflictError(percent);
  }
}

export async function requireRegime(regimes: TvaRegimeRepository, id: string): Promise<TvaRegime> {
  const regime = await regimes.findById(id);
  if (regime === null) {
    throw new TvaRegimeNotFoundError(id);
  }
  return regime;
}
