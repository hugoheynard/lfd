/** Les pièces d'un article retrouvées, et combien. */
export interface FoundQuantity {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **« Pièces retrouvées »** (plan des niveaux de suivi du colisage, D6) : des
 * pièces mises de côté comme absentes reviennent au libre de la réserve du
 * jour. `intentKey` : la clé de l'écran — un double clic ne rend qu'une fois.
 */
export class RecoverMissingPiecesCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly found: readonly FoundQuantity[],
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
