import type { CatalogFamilyView } from "@lfd/contracts";

import type { SaleUnit } from "./resupply-sale-unit.js";

/**
 * Un article qu'un site peut recevoir : le SKU produit, son nom publié et sa
 * famille (tête de lignée), par laquelle le comptoir range sa table.
 */
export interface ResupplyArticle {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /**
   * Sa famille, parentes comprises (décidé avec Hugo le 2026-11-24) : le rail
   * des rayons d'un modèle la range en arbre, comme la saisie de commande.
   * `categoryId` / `categoryName` en restent la tête, pour leurs lecteurs.
   */
  readonly family: CatalogFamilyView;
  /**
   * L'unité de vente, FIGÉE sur la ligne de réassort à son ajout (L2b-1,
   * Hugo 2026-11-02 : « un article au poids doit avoir un stock au poids ») :
   * au poids, la quantité compte des grammes.
   */
  readonly saleUnit: SaleUnit;
}

/**
 * Port de **lecture** du catalogue publié, vu du réapprovisionnement : ce que
 * la boutique vend aux particuliers (la vitrine). Aucun prix : un
 * réapprovisionnement n'en porte pas.
 */
export abstract class ResupplyCatalogue {
  /** Les articles proposables, dans l'ordre du référentiel. */
  abstract articles(): Promise<readonly ResupplyArticle[]>;

  /** L'article publié sous ce SKU produit, ou `null` s'il est inconnu ou masqué. */
  abstract article(sku: string): Promise<ResupplyArticle | null>;
}
