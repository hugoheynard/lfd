/**
 * **La garde passée au livreur**, par commande
 * (`documentation/livraisons/plan-a-la-porte.md`, § 10 ter, BQ).
 *
 * Une écriture nue, et c'est voulu : c'est la PROJECTION d'un fait déjà
 * validé ailleurs (le départ de la tournée, annoncé après sa validation). Il
 * n'y a aucune règle qui puisse la refuser — le retrait ne juge pas un départ,
 * il le retient. Rejouée, elle réécrit le même instant.
 */
export abstract class OrderDepartureRepository {
  abstract recordDeparted(orderIds: readonly string[], at: Date): Promise<void>;
}
