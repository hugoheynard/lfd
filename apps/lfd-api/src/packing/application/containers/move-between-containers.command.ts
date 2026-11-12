/**
 * Déplacer des pièces d'une ligne d'un contenant à un autre de la même
 * commande. `intentKey` : la clé que l'écran a fabriquée pour ce geste — un
 * double clic ne déplace qu'une fois.
 */
export class MoveBetweenContainersCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly fromContainerId: string,
    readonly toContainerId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
