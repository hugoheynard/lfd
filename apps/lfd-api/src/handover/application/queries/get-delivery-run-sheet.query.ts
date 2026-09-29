/** La feuille de route des livraisons pour un jour de service (`AAAA-MM-JJ`). */
export class GetDeliveryRunSheetQuery {
  constructor(readonly day: string) {}
}
