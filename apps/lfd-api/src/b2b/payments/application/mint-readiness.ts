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
import type {
  MandateDebtorReader,
  ResolvedMandateDebtor,
} from "../domain/ports/mandate-debtor.reader.js";
import type { Clock } from "../../../platform/time/clock.js";
import { type MintBlocker, mintBlockersOf } from "../domain/services/mint-blockers.js";

/** Les lectures qu'il faut pour juger une frappe, et l'instant auquel on la juge. */
export interface MintReadinessDeps {
  readonly mandates: PaymentMandateRepository;
  readonly accounts: CompanyBankAccountRepository;
  readonly creditors: CreditorReader;
  readonly debtors: MandateDebtorReader;
  readonly clock: Clock;
}

/** Ce qu'une frappe lirait, et ce qui l'empêcherait. */
export interface MintReadiness {
  /** La société du mandat — sa référence entre dans la RUM. */
  readonly holder: MandateHolder;
  /**
   * Le débiteur RÉSOLU (plan-sous-comptes §2.1 ter) : la société du principal
   * pour un site qui suit `billing`, et le compte que le mandat débiterait.
   */
  readonly debtor: ResolvedMandateDebtor;
  /** Le RIB du compte débité — celui du payeur, ou celui du site en « RIB propre ». */
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
  const debtor = await deps.debtors.resolve(companyId, deps.clock.now());
  if (holder === null || debtor === null) {
    throw new CompanyNotFoundForMandateError(companyId);
  }
  // 🔴 L'identité RÉSOLUE, pas la ligne de la société (T9) : un site qui suit
  // `billing` n'a pas de SIREN, et son mandat nomme celui du principal. Lue
  // ici, elle l'est par la frappe ET par les deux écrans qui l'annoncent.
  const account = await deps.accounts.findByCompany(debtor.accountCompanyId);
  const issuer = await soleIssuerOrNull(deps.creditors);
  const blockers = mintBlockersOf({
    bankAccount: account?.account ?? null,
    issuerScheme: issuer?.mandateScheme ?? null,
    debtor: { companyName: debtor.debtor.name, siren: debtor.debtor.siren },
  });
  return { holder, debtor, account, issuer, blockers };
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
