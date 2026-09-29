/** Les sacs d'une commande — pour le colisage et la page d'étiquettes. */
export class GetDeliveryOrderBagsQuery {
  constructor(readonly orderId: string) {}
}
