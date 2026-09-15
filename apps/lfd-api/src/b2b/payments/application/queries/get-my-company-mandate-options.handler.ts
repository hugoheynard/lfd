import type { CustomerMandateOptionsSectionView, CustomerMandateOptionsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
import { readMintReadiness } from "../mint-readiness.js";
import { GetMyCompanyMandateOptionsQuery } from "./get-my-company-mandate-options.query.js";

/**
 * Rend les zones 14 et 19 au client, ou `null` tant qu'aucun RIB n'est déposé
 * — elles vivent sur sa ligne.
 *
 * Même seuil que les autres routes client du mandat (404 → 403 → drapeau 409) :
 * une carte qui montrerait des zones qu'aucune route ne permet d'écrire
 * promettrait un geste que le serveur refuse. La lecture, elle, ne refuse pas
 * sous un mandat actif : les voir est ce qui permet de savoir quoi demander.
 *
 * ## Le schéma de l'émetteur (depuis le 2026-09-15)
 *
 * L'enveloppe porte `issuerScheme`, lu par `soleIssuer()` — le même émetteur que
 * la frappe et le rendu. Le mandat interentreprises n'imprime pas ces zones, et
 * l'écran masque la carte en `B2B` (plan `documentation/b2b/plan-mandat-deux-schemas.md`
 * §10, Q2). Lu APRÈS le mur et le drapeau : rien de l'émetteur ne sort vers
 * quelqu'un qui n'a pas droit aux zones.
 *
 * 🔴 Une entité incomplète ou deux émetteurs rendent `issuerScheme: null` et
 * non un 409 : cette lecture sert l'écran Mon compte à chaque ouverture, et la
 * laisser lever casserait la carte mandat de tous les clients pour une fiche
 * staff mal remplie. La frappe, elle, refuse toujours.
 *
 * ## Ce qui empêche de générer (depuis le 2026-09-15)
 *
 * `mintBlockers` vient de `readMintReadiness`, **la même lecture que la
 * frappe** : un bouton « Générer » actif ne peut pas buter sur un refus que
 * l'écran n'annonçait pas (plan `plan-mentions-obligatoires-du-mandat.md` §9).
 */
@QueryHandler(GetMyCompanyMandateOptionsQuery)
export class GetMyCompanyMandateOptionsHandler implements IQueryHandler<
  GetMyCompanyMandateOptionsQuery,
  CustomerMandateOptionsSectionView
> {
  constructor(
    private readonly guard: BankAccountGuardReader,
    private readonly gate: CustomerMandateGate,
    private readonly accounts: CompanyBankAccountRepository,
    private readonly creditors: CreditorReader,
    private readonly mandates: PaymentMandateRepository,
  ) {}

  async execute({
    actorUserId,
    companyId,
  }: GetMyCompanyMandateOptionsQuery): Promise<CustomerMandateOptionsSectionView> {
    await ensureCustomerMandateAccess(
      { guard: this.guard, gate: this.gate },
      actorUserId,
      companyId,
    );

    const { account, issuer, blockers } = await readMintReadiness(
      { mandates: this.mandates, accounts: this.accounts, creditors: this.creditors },
      companyId,
    );
    return {
      options: account === null ? null : optionsOf(account.options),
      issuerScheme: issuer?.mandateScheme ?? null,
      mintBlockers: blockers,
    };
  }
}

function optionsOf(options: CustomerMandateOptionsView): CustomerMandateOptionsView {
  return { debtorReference: options.debtorReference, contractNumber: options.contractNumber };
}
