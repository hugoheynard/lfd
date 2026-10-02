import type { HandoverProofPiece } from "../../../../handover/channels/commerce/index.js";

/**
 * Une image de la preuve de remise d'une commande — désignée par la commande
 * et la pièce, jamais par une clé de stockage.
 */
export class GetOrderHandoverProofImageQuery {
  constructor(
    readonly orderId: string,
    readonly piece: HandoverProofPiece,
  ) {}
}
