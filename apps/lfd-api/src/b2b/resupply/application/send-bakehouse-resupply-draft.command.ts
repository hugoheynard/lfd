import type { BakehouseResupplyDraftContent } from "../domain/bakehouse-resupply-draft.js";

/**
 * Envoyer un brouillon repris : le contenu ENTIER de l'écran et la version
 * lue. Rend l'identifiant du réassort créé.
 */
export class SendBakehouseResupplyDraftCommand {
  constructor(
    readonly draftId: string,
    readonly content: BakehouseResupplyDraftContent,
    readonly version: number,
    readonly staffUserId: string,
  ) {}
}
