/**
 * **Les SKU de vente froids, vus par la livraison** — ce que la livraison
 * DÉCLARE et que le commerce implémente (`b2b/catalog/infrastructure/`),
 * relié dans `appBootstrap`.
 *
 * Un port à part de `DeliveryProductsReader` (ISP) : celui-là sert la grille
 * des contenances, le catalogue PRO par défaut ; celui-ci sert le colisage et
 * la feuille d'arrêt, qui comparent au SKU que porte une LIGNE de commande —
 * une déclinaison vendue en vignette, ou vendue au public seulement, compris
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L0).
 */
export abstract class DeliveryColdSkusReader {
  /**
   * Les SKU de vente dont l'article en rayon demande le froid, toutes
   * audiences. Un article retiré n'y figure pas.
   */
  abstract coldSkus(): Promise<ReadonlySet<string>>;
}
