/** Un produit vendu, tel que la livraison a besoin de le connaître : SKU opaque et nom. */
export interface DeliveryProduct {
  readonly sku: string;
  readonly name: string;
  /**
   * **Demande le froid** — tel que la fiche du référentiel le dit, publié dans
   * le catalogue B2B (fil v12, lot 4 bis v2-2). Un produit froid ne va qu'en
   * bac isotherme. `false` = rien de déclaré, pas « se conserve au sec ».
   */
  readonly requiresCold: boolean;
}

/**
 * **Les produits vendus, vus par la livraison** (lot 4 bis, v2-2) — ce que la
 * livraison DÉCLARE et que le commerce implémente
 * (`b2b/catalog/infrastructure/`), relié dans `appBootstrap`.
 *
 * La grille des contenances a besoin d'une liste de produits et de leurs noms.
 * La livraison ne lit ni le référentiel ni le miroir du catalogue : le
 * commerce relaie SON catalogue B2B vendu, sous le SKU que portent les lignes
 * de commande — celui que le colisage comparera.
 */
export abstract class DeliveryProductsReader {
  /** Le catalogue B2B vendable, dans l'ordre où il se parcourt. */
  abstract sold(): Promise<readonly DeliveryProduct[]>;
}
