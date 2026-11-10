import type { SetMandateOptionsPayload } from "@lfd/contracts";

/**
 * Réécrire les **zones facultatives** du mandat d'un client — 14, 19, 20.
 *
 * Commande distincte de {@link SetCompanyBankAccountCommand}, et la séparation
 * est celle du domaine : rien ici ne touche à ce que le débiteur a autorisé.
 * Corriger la description d'un contrat ne remet aucun mandat en cause.
 */
export class SetMandateOptionsCommand {
  constructor(
    readonly companyId: string,
    readonly payload: SetMandateOptionsPayload,
  ) {}
}
