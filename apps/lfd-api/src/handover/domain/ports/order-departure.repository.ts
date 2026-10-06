/**
 * **La garde passée au livreur**, par commande
 * (`documentation/livraisons/a-la-porte.md`, § 10 ter, BQ).
 *
 * Une écriture nue, et c'est voulu : c'est la PROJECTION de faits déjà
 * validés ailleurs (`delivery.round_departed`, `delivery.orders_brought_back`,
 * livrés par la boîte d'envoi). Il n'y a aucune règle qui puisse la refuser —
 * le retrait ne juge pas un départ, il le retient. La seule garde est
 * l'ORDRE DES INSTANTS, tenue dans le `where` (`plan-depart-durable.md`, B1) :
 * rejouée ou livrée en retard, une écriture ne recule jamais l'état.
 */
export abstract class OrderDepartureRepository {
  /**
   * La commande est partie à `at` — seulement si son dernier départ connu est
   * nul ou ANTÉRIEUR ou égal à `at`, et qu'aucun retour n'est postérieur ou égal à
   * `at`. Un départ plus récent qu'un retour l'efface : la commande est de
   * nouveau partie ; un départ plus ancien que l'état ne fait rien.
   */
  abstract recordDeparted(orderIds: readonly string[], at: Date): Promise<void>;

  /**
   * La commande « rapportée » est revenue (B3, LB-Q2) — seulement si son
   * dernier départ connu est ANTÉRIEUR ou égal à `at` : une annonce tardive
   * ne ramène pas une commande déjà repartie. Un retour livré AVANT son
   * départ s'écrit quand même (la boîte d'envoi ne garantit aucun ordre) : le
   * départ, plus ancien, ne l'effacera pas.
   */
  abstract recordReturned(orderIds: readonly string[], at: Date): Promise<void>;
}
