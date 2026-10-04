/** Glisser des pièces d'une ligne dans un contenant (K2b). */
export class AllocateToContainerCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly containerId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly staffUserId: string,
  ) {}
}
