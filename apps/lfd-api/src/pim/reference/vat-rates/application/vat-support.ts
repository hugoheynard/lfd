import { assertFree } from "../../../shared/assert-free.js";
import {
  VatRateArchivedError,
  VatRateConflictError,
  VatRateNotFoundError,
} from "../domain/errors/vat-rate-errors.js";
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
    (existing) => new VatRateConflictError(percent, existing.isArchived),
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

/**
 * Le taux qu'une famille ou une fiche s'apprête à porter : il existe ET il est
 * en service. Un taux archivé ne se propose plus — et aucune fiche ne doit se
 * retrouver facturée à un taux que plus personne ne peut choisir.
 *
 * Appelée dans la transaction de la pose, APRÈS `VatRateLock.forUse` : lue
 * sans le verrou, elle pourrait voir le taux en service pendant qu'une archive
 * le retire.
 *
 * @throws {VatRateNotFoundError} l'identifiant ne désigne aucun taux.
 * @throws {VatRateArchivedError} le taux est archivé.
 */
export async function requireRateInService(rates: VatRateRepository, id: string): Promise<VatRate> {
  const rate = await requireRate(rates, id);
  if (rate.isArchived) {
    throw new VatRateArchivedError(rate.snapshot().name);
  }
  return rate;
}
