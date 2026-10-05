import { SiteDebitsPayerAccountError } from "../domain/errors/sub-account-mandate-errors.js";
import type { MandateDebtorReader } from "../domain/ports/mandate-debtor.reader.js";

/**
 * Refuse, sur une route CLIENT, le mandat d'un site qui débite le compte de
 * son principal (`plan-sous-comptes.md` §3) : son papier imprime l'IBAN du
 * principal, et aucune route client ne résout vers lui. Le staff, lui, passe.
 *
 * @throws {SiteDebitsPayerAccountError} le site suit `billing` sans RIB propre.
 */
export async function ensureSiteDebitsOwnAccount(
  debtors: MandateDebtorReader,
  companyId: string,
  at: Date,
): Promise<void> {
  const resolved = await debtors.resolve(companyId, at);
  if (resolved?.billedTo != null && resolved.accountCompanyId !== companyId) {
    throw new SiteDebitsPayerAccountError(companyId, resolved.billedTo.name);
  }
}
