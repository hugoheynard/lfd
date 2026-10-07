/**
 * **« Lesquelles de ces commandes sont retenues ? »** — ce que la livraison
 * demande au retrait au moment de partir
 * (`documentation/livraisons/livreur/a-la-porte.md`, § 10 ter, BQ).
 *
 * LB-Q1, tranché par Hugo le 2026-10-01 : on ne contrôle plus une commande
 * dont la tournée est partie — le produit n'est plus là. Une retenue posée
 * avant le départ doit donc l'arrêter : la camionnette ne l'emporte pas.
 *
 * Déclaré par la livraison, implémenté par le retrait, qui lit la retenue sur
 * le port que la production publie (`QualityHoldsReader`), comme au comptoir.
 * La livraison ne sait pas qui répond ; `appBootstrap` relie.
 *
 * Par lot : une question pour toute la tournée.
 */
export abstract class DepartureHoldsReader {
  /** Le sous-ensemble de `orderIds` retenu au contrôle qualité. */
  abstract heldOrders(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
