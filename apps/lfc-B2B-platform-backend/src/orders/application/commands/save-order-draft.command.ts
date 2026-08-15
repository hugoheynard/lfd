import type { OrderDraftPayload } from "@lfd/contracts";

/**
 * Met une saisie de côté pour cette société.
 *
 * `savedByStaffId` vient de la **porte**, jamais du corps : l'auteur d'une trace
 * ne se choisit pas — le même parti que la commande saisie par l'équipe.
 */
export class SaveOrderDraftCommand {
  constructor(
    readonly companyId: string,
    readonly savedByStaffId: string,
    readonly payload: OrderDraftPayload,
  ) {}
}
