/** Retirer le visa en cours d'une commande — par n'importe quel porteur du droit. */
export class WithdrawOrderReviewCommand {
  constructor(
    readonly orderId: string,
    /** La fiche du staff qui retire : l'auteur du retrait et l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
