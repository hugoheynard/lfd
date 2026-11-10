/** Commande **staff** : retirer une zone de livraison (globale). */
export class RemoveDeliveryZoneCommand {
  constructor(readonly id: string) {}
}
