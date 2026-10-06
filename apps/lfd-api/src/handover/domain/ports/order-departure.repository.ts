/**
 * **La garde passée au livreur**, par commande
 * (`documentation/livraisons/a-la-porte.md`, § 10 ter, BQ).
 *
 * Une écriture nue, et c'est voulu : c'est la PROJECTION d'un fait déjà
 * validé ailleurs (le départ de la tournée, annoncé après sa validation). Il
 * n'y a aucune règle qui puisse la refuser — le retrait ne juge pas un départ,
 * il le retient. Rejouée, elle réécrit le même instant.
 */
export abstract class OrderDepartureRepository {
  /** Un départ efface un retour précédent : la commande est de nouveau partie. */
  abstract recordDeparted(orderIds: readonly string[], at: Date): Promise<void>;

  /**
   * La commande « rapportée » est revenue (B3, LB-Q2) — seulement si son
   * dernier départ est ANTÉRIEUR ou égal à `at` : une annonce tardive ne
   * ramène pas une commande déjà repartie. Une commande jamais annoncée
   * partie n'a rien à marquer.
   */
  abstract recordReturned(orderIds: readonly string[], at: Date): Promise<void>;
}
