/**
 * Ressortir des pièces d'une ligne d'un contenant (K2b). `intentKey` : la clé
 * que l'écran a fabriquée pour ce geste — un double clic ne ressort qu'une fois.
 */
export class WithdrawFromContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly containerId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
