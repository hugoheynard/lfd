/** Requête **staff** : les livraisons attendues un jour donné, vues du carnet (Tour manager). */
export class GetDeliveryDayAddressesQuery {
  constructor(public readonly day: string) {}
}
