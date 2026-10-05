/** Rouvrir le rangement d'une commande fermée (K3a, §17.2, option b). */
export class ReopenPackingOrderCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
  ) {}
}
