import type { ProductBatchShortcuts } from "../entities/product-batch-shortcuts.js";

/**
 * Port d'**écriture** des raccourcis du fournil (plan
 * `fournil/plan-raccourcis-du-fournil.md`, S1) : l'agrégat d'un produit se
 * charge entier — ses raccourcis vivants — et se sauve par ce qui a changé.
 *
 * Le chargement se fait DANS l'unité de travail et y verrouille le produit :
 * deux ajouts concurrents ne franchissent pas le plafond ensemble.
 */
export abstract class BatchShortcutRepository {
  /** Les raccourcis vivants du produit ; aucun : un agrégat vide. */
  abstract loadForSku(sku: string): Promise<ProductBatchShortcuts>;

  /** L'agrégat du produit qui porte ce raccourci vivant ; `null` : inconnu ou retiré. */
  abstract loadHolding(shortcutId: string): Promise<ProductBatchShortcuts | null>;

  abstract save(shortcuts: ProductBatchShortcuts): Promise<void>;
}
