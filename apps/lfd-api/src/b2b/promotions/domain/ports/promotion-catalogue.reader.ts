import type { SaleUnit } from "@lfd/money";

/** Un article vendable, tel que le refus de chevauchement et l'écran le lisent. */
export interface PromotionCatalogueArticle {
  /** Le SKU de vente — ce qu'une cible `variant` nomme. */
  readonly sku: string;
  readonly name: string;
  /** `catalog_items.product_id` — ce qu'une cible `product` nomme. */
  readonly productId: string | null;
  /** Sa famille puis ses parentes, la plus proche en tête. */
  readonly categoryPath: readonly string[];
  readonly saleUnit: SaleUnit;
}

/** Le catalogue vendable et les noms que l'écran montre à la place des identifiants. */
export interface PromotionCatalogue {
  /** Rangés par nom : le premier article commun est le témoin d'un refus. */
  readonly articles: readonly PromotionCatalogueArticle[];
  readonly categoryNames: ReadonlyMap<string, string>;
  /** Le nom de la déclinaison par défaut de chaque produit. */
  readonly productNames: ReadonlyMap<string, string>;
}

/**
 * **Le catalogue vendable, vu des promotions** (`documentation/promotions/promotions.md`, § 2.16, CHEVAUCHEMENT) — déclaré ici, implémenté par le catalogue, qui
 * possède `catalog_items`. Le refus de chevauchement se juge sur ce qui se
 * vend, pas par une contrainte en base : une contrainte ne lit pas les
 * exceptions d'une portée.
 */
export abstract class PromotionCatalogueReader {
  abstract snapshot(): Promise<PromotionCatalogue>;
}
