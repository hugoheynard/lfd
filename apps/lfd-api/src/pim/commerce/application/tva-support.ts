import { TvaRateConflictError, TvaRateNotFoundError } from "../domain/errors/commerce-errors.js";
import type { TvaRate } from "../domain/entities/tva-rate.js";
import { TvaRateRepository } from "../domain/ports/tva-rate.repository.js";

/**
 * Les gardes que l'agrégat ne peut pas tenir : elles regardent les AUTRES
 * taux.
 */

/** Refuse un taux déjà porté par un **autre** taux. */
export async function ensureRateFree(
  rates: TvaRateRepository,
  percent: number,
  exceptId: string | null,
): Promise<void> {
  const existing = await rates.findByPercent(percent);
  if (existing !== null && existing.id !== exceptId) {
    throw new TvaRateConflictError(percent);
  }
}

export async function requireRate(rates: TvaRateRepository, id: string): Promise<TvaRate> {
  const rate = await rates.findById(id);
  if (rate === null) {
    throw new TvaRateNotFoundError(id);
  }
  return rate;
}
