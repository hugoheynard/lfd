/** Les BL d'une commande, tels que l'équipe les lit dans sa fiche (plan E5a, § 3). */
export class ListOrderDeliveryNotesQuery {
  constructor(readonly orderId: string) {}
}
