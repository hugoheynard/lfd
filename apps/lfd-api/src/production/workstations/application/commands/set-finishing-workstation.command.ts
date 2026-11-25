/** Ce poste finit désormais ce produit (référence produit) ; il doit déjà en être un poste. */
export class SetFinishingWorkstationCommand {
  constructor(
    readonly workstationId: string,
    readonly productSku: string,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un double clic ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
