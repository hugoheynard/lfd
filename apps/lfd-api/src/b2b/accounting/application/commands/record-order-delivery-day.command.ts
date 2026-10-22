/**
 * **Poser le jour de livraison d'un bon**, s'il n'en a pas (lot ZL) : envoyé
 * par l'abonné du retrait (`RecordDeliveryDayOnHandover`) et par la reprise
 * du semis de développement. Sans effet sur un bon jamais remis, ou daté.
 */
export class RecordOrderDeliveryDayCommand {
  constructor(readonly orderId: string) {}
}
