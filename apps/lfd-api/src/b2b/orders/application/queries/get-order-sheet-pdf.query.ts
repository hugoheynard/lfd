/**
 * Le **bon de commande en PDF**, pour son client.
 *
 * Aucune audience en paramètre, comme pour la feuille : elle est décidée par la
 * route. Un client qui pourrait demander `audience=staff` recevrait les SKU et
 * la trace du prix.
 */
export class GetOrderSheetPdfQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
