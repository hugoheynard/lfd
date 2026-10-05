/** Fermer le bac d'une commande — « Déclarer prête » au colisage (K3a). */
export class ClosePackingOrderCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
