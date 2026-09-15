import type { MintBlocker, SepaScheme } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { readMintReadiness } from "../mint-readiness.js";
import { GetMandateMintBlockersQuery } from "./get-mandate-mint-blockers.query.js";

/**
 * Les blocages de frappe d'une société, pour le back-office.
 *
 * Une requête à part plutôt qu'un champ de plus dans `GetCompanyMandateQuery` :
 * celle-ci rend le mandat courant, et l'ancienne route de la pièce la relit
 * pour un tout autre usage. Lui greffer trois lectures de plus les ferait payer
 * à un appelant qui n'en veut aucune.
 *
 * `readMintReadiness` est la lecture de la frappe elle-même : ce que la fiche
 * annonce est ce que le serveur opposerait (plan
 * `plan-mentions-obligatoires-du-mandat.md` §9).
 *
 * @throws {CompanyNotFoundForMandateError} l'id ne désigne aucune société (404).
 */
/**
 * Ce que l'écran staff doit savoir de la frappe : ce qui la bloque, et le schéma
 * de l'émetteur — qui décide si la forme juridique du titulaire est EXIGÉE sur
 * le RIB (retour de Hugo, 2026-09-15). Les deux viennent de la même lecture que
 * la frappe : l'écran ne peut pas annoncer un champ facultatif que la frappe
 * exigera.
 */
export interface MandateMintReadinessView {
  readonly blockers: readonly MintBlocker[];
  readonly issuerScheme: SepaScheme | null;
}

@QueryHandler(GetMandateMintBlockersQuery)
export class GetMandateMintBlockersHandler implements IQueryHandler<
  GetMandateMintBlockersQuery,
  MandateMintReadinessView
> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly creditors: CreditorReader,
  ) {}

  async execute({ companyId }: GetMandateMintBlockersQuery): Promise<MandateMintReadinessView> {
    const { blockers, issuer } = await readMintReadiness(
      { mandates: this.mandates, accounts: this.accounts, creditors: this.creditors },
      companyId,
    );
    return { blockers, issuerScheme: issuer?.mandateScheme ?? null };
  }
}
