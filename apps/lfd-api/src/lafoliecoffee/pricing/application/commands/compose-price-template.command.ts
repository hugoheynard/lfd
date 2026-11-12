import type { SavePriceTemplatePayload } from "@lfd/contracts";

/**
 * **Composer** un gabarit tarifaire neuf — une fois par intention : la clé de
 * l'écran (`Idempotency-Key`) fait qu'un double clic ne compose pas deux
 * gabarits.
 */
export class ComposePriceTemplateCommand {
  constructor(
    readonly payload: SavePriceTemplatePayload,
    /** La fiche du staff qui agit : l'auteur du gabarit et l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`). */
    readonly intentKey: string,
  ) {}
}
