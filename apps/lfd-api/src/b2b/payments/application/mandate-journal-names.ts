import { CompanyNotFoundForMandateError } from "../domain/errors/mandate-errors.js";
import type { MandateCompany } from "../domain/events/payment-mandate.events.js";
import type { PaymentMandateRepository } from "../domain/payment-mandate.repository.js";

/**
 * La société qu'un fait du mandat ou du RIB cite, **nommée** au moment du geste
 * (lot B du plan `documentation/journalisation/plan-phrases-du-journal.md`,
 * D5) — par le port que le contexte a déjà pour l'identifier (`findHolder`).
 *
 * @throws {CompanyNotFoundForMandateError} aucune société sous cet identifiant.
 */
export async function mandateCompanyOf(
  mandates: PaymentMandateRepository,
  companyId: string,
): Promise<MandateCompany> {
  const holder = await mandates.findHolder(companyId);
  if (holder === null) {
    throw new CompanyNotFoundForMandateError(companyId);
  }
  return { id: companyId, name: holder.displayName };
}
