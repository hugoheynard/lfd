import type { CreditorSnapshot } from "../../accounting/domain/creditor-snapshot.js";
import {
  EntityCannotCollectError,
  SeveralIssuersError,
} from "../../accounting/domain/errors/accounting-errors.js";
import type { CreditorReader } from "../../accounting/domain/ports/creditor.reader.js";
import type { CompanyBankAccount } from "../domain/entities/company-bank-account.js";
import { CompanyNotFoundForMandateError } from "../domain/errors/mandate-errors.js";
import type {
  MandateHolder,
  PaymentMandateRepository,
} from "../domain/payment-mandate.repository.js";
import type { CompanyBankAccountRepository } from "../domain/ports/company-bank-account.repository.js";
import { type MintBlocker, mintBlockersOf } from "../domain/services/mint-blockers.js";

/** Les trois lectures qu'il faut pour juger une frappe. */
export interface MintReadinessDeps {
  readonly mandates: PaymentMandateRepository;
  readonly accounts: CompanyBankAccountRepository;
  readonly creditors: CreditorReader;
}

/** Ce qu'une frappe lirait, et ce qui l'empêcherait. */
export interface MintReadiness {
  readonly holder: MandateHolder;
  readonly account: CompanyBankAccount | null;
  /** L'émetteur unique et complet, ou `null` — absent, incomplet ou en double. */
  readonly issuer: CreditorSnapshot | null;
  readonly blockers: readonly MintBlocker[];
}

/**
 * Lit la société, son RIB et l'émetteur, puis juge la frappe par
 * `mintBlockersOf`.
 *
 * 🔴 **Partagé par la frappe ET par les deux lectures** (staff : section
 * mandat ; client : options du mandat). Ce n'est pas une économie de lignes :
 * c'est ce qui garantit que l'écran annonce exactement les blocages que la
 * frappe opposerait — mêmes lectures, même traduction de l'émetteur, même
 * fonction. Ce n'est pas un handler, pour la raison du §4 de `CLAUDE.md` (pas
 * d'appel croisé entre écriture et lecture).
 *
 * @throws {CompanyNotFoundForMandateError} l'id ne désigne aucune société (404).
 */
export async function readMintReadiness(
  deps: MintReadinessDeps,
  companyId: string,
): Promise<MintReadiness> {
  const holder = await deps.mandates.findHolder(companyId);
  if (holder === null) {
    throw new CompanyNotFoundForMandateError(companyId);
  }
  const account = await deps.accounts.findByCompany(companyId);
  const issuer = await soleIssuerOrNull(deps.creditors);
  const blockers = mintBlockersOf({
    bankAccount: account?.account ?? null,
    issuerScheme: issuer?.mandateScheme ?? null,
    debtor: holder,
  });
  return { holder, account, issuer, blockers };
}

/**
 * L'émetteur unique et complet, ou `null`.
 *
 * Les deux refus de configuration — entité incomplète, plusieurs entités
 * actives — deviennent `null`, donc le blocage `issuer_missing` : ils ne sont
 * pas avalés, ils sont **nommés** autrement. Une lecture qui les laisserait
 * lever casserait l'écran Mon compte de tous les clients pour une fiche staff
 * mal remplie (régression du 2026-09-15) ; la frappe, elle, refuse toujours.
 */
export async function soleIssuerOrNull(
  creditors: CreditorReader,
): Promise<CreditorSnapshot | null> {
  try {
    return await creditors.soleIssuer();
  } catch (error) {
    if (error instanceof EntityCannotCollectError || error instanceof SeveralIssuersError) {
      return null;
    }
    throw error;
  }
}
