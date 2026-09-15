import type {
  CustomerMandateOptionsSectionView,
  CustomerMandateOptionsView,
  SepaScheme,
} from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  EntityCannotCollectError,
  SeveralIssuersError,
} from "../../../accounting/domain/errors/accounting-errors.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { BankAccountGuardReader } from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";
import { ensureCustomerMandateAccess } from "../customer-mandate-access.js";
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
 * ⚠️ Ses refus remontent tels quels — plusieurs entités actives (409), entité
 * incomplète (409). Rendre `null` à leur place ferait afficher une carte sous un
 * schéma inconnu, sans rien dire de ce qui est à corriger.
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

    const found = await this.accounts.findByCompany(companyId);
    return {
      options: found === null ? null : optionsOf(found.options),
      issuerScheme: await this.issuerScheme(),
    };
  }

  /**
   * Le schéma de l'émetteur, ou `null` quand on ne peut pas le dire.
   *
   * 🔴 Une entité incomplète ou deux émetteurs sont des défauts de CONFIGURATION
   * staff, pas une faute du client : cette lecture sert l'écran Mon compte à
   * chaque ouverture (2026-09-15), et la laisser lever un 409 casserait la
   * carte mandat de tous les clients pour une fiche mal remplie. La frappe, elle,
   * refuse toujours — c'est là que le défaut doit se voir.
   */
  private async issuerScheme(): Promise<SepaScheme | null> {
    try {
      return (await this.creditors.soleIssuer())?.mandateScheme ?? null;
    } catch (error) {
      if (error instanceof EntityCannotCollectError || error instanceof SeveralIssuersError) {
        return null;
      }
      throw error;
    }
  }
}

function optionsOf(options: CustomerMandateOptionsView): CustomerMandateOptionsView {
  return { debtorReference: options.debtorReference, contractNumber: options.contractNumber };
}
