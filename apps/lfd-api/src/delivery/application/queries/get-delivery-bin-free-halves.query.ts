/** Les moitiés de bac libres aux arrêts voisins d'une commande. */
export class GetDeliveryBinFreeHalvesQuery {
  constructor(readonly orderId: string) {}
}
