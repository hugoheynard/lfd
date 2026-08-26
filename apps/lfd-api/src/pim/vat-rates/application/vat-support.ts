import { VatRateConflictError, VatRateNotFoundError } from "../domain/errors/vat-rate-errors.js";
import type { VatRate } from "../domain/entities/vat-rate.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";

/**
 * Les gardes que l'agrégat ne peut pas tenir : elles regardent les AUTRES
 * taux.
 */

/** Refuse un taux déjà porté par un **autre** taux. */
export async function ensureRateFree(
  rates: VatRateRepository,
  percent: number,
  exceptId: string | null,
): Promise<void> {
  const existing = await rates.findByPercent(percent);
  if (existing !== null && existing.id !== exceptId) {
    throw new VatRateConflictError(percent);
  }
}

export async function requireRate(rates: VatRateRepository, id: string): Promise<VatRate> {
  const rate = await rates.findById(id);
  if (rate === null) {
    throw new VatRateNotFoundError(id);
  }
  return rate;
}
