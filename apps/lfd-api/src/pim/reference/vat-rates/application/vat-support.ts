import { assertFree } from "../../../shared/assert-free.js";
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
  assertFree(
    await rates.findByPercent(percent),
    () => new VatRateConflictError(percent),
    (existing) => existing.id === exceptId,
  );
}

export async function requireRate(rates: VatRateRepository, id: string): Promise<VatRate> {
  const rate = await rates.findById(id);
  if (rate === null) {
    throw new VatRateNotFoundError(id);
  }
  return rate;
}
