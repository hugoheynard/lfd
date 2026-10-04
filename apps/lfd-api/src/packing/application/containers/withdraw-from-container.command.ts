/** Ressortir des pièces d'une ligne d'un contenant (K2b). */
export class WithdrawFromContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly containerId: string,
    readonly sku: string,
    readonly quantity: number,
  ) {}
}
