import type { CatalogFamilyView } from "@lfd/contracts";

import type { CatalogSaleUnit } from "../catalog-sale-unit.js";

/**
 * Un article réservé au réassort des boutiques : ce que le comptoir range
 * dans sa table. Aucun prix : il ne se vend à personne.
 */
export interface ResupplyOnlyArticle {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /** Sa famille avec ses parentes : le rail des rayons range en arbre. */
  readonly family: CatalogFamilyView;
  readonly saleUnit: CatalogSaleUnit;
}

/**
 * **Ce que le catalogue sait répondre au réassort** : les articles d'audience
 * `resupply` (`documentation/reassort-boutiques/plan-articles-de-reassort.md`).
 *
 * Les articles servis au public, eux, se lisent par `CatalogReader` comme la
 * vitrine : le réassort ajoute ceux-ci, il ne remplace rien. Jugés par
 * `servedToResupply` — la règle unique — et seulement ceux qui paraissent au
 * rayon (`isShownAsTile`).
 */
export abstract class ResupplyOnlyArticlesReader {
  /** Les articles réservés au réassort, dans l'ordre du référentiel. */
  abstract articles(): Promise<readonly ResupplyOnlyArticle[]>;

  /** L'article réservé au réassort sous ce SKU de vente, ou `null`. */
  abstract article(sku: string): Promise<ResupplyOnlyArticle | null>;
}
