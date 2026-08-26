import type { PointOfSale } from "../value-objects/point-of-sale.js";

/**
 * La lecture des points de vente. **Aucune écriture** en p-0, et c'est
 * délibéré : les boutiques s'écrivent encore par l'écran des emplacements, qui
 * tient ce miroir dans sa propre transaction. Ouvrir une seconde porte
 * d'écriture ici ferait deux vérités le temps de la bascule.
 */
export abstract class PointOfSaleReader {
  /** Tous les points de vente, boutiques et plateformes, dans un ordre stable. */
  abstract listAll(): Promise<readonly PointOfSale[]>;

  /**
   * Garantit la **plateforme racine** et l'offre du contexte racine.
   *
   * Appelée au boot. La migration ne suffirait pas : supprimée en base, la
   * ligne ne reviendrait jamais — exactement la panne que la garde du contexte
   * `b2b` existe pour empêcher.
   */
  abstract ensureRootPointOfSale(): Promise<void>;
}
