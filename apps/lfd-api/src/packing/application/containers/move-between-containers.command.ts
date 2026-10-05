/** Déplacer des pièces d'une ligne d'un contenant à un autre de la même commande. */
export class MoveBetweenContainersCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly fromContainerId: string,
    readonly toContainerId: string,
    readonly sku: string,
    readonly quantity: number,
  ) {}
}
