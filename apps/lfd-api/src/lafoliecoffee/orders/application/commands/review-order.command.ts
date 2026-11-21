/** Viser une commande passée par un client pro (plan du visa des commandes). */
export class ReviewOrderCommand {
  constructor(
    readonly orderId: string,
    /** La fiche du staff qui vise : l'auteur du visa et l'acteur de l'intention. */
    readonly staffUserId: string,
    /** Facultative ; une note faite d'espaces vaut « pas de note ». */
    readonly note: string | null,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
