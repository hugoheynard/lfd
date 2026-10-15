import type { PimFacts } from "./entities/catalog-item.js";
import type { CatalogAudience } from "./served-to.js";

/**
 * Un article reçu par le fait de sa fiche : les faits d'un article, plus
 * l'identifiant de sa déclinaison au référentiel — qu'une règle de limite de
 * commande de rang « déclinaison » vise (lot 2b). Le push ne le porte pas.
 */
export interface ReceivedCatalogItem extends PimFacts {
  readonly variantId: string;
}

/** L'état d'une fiche reçue, dans les mots de l'écran. */
export type CatalogEntryStatus = "inactive" | "active" | "archived";

/**
 * **Une fiche telle qu'un fait du référentiel l'apporte** (lot 2a de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`).
 *
 * `items` porte les déclinaisons COMPLÈTES, déjà converties en faits
 * d'articles ; `gaps` dit ce qui manque aux autres. Une fiche inactive porte
 * aussi ses déclinaisons complètes — elle ne les vend pas pour autant.
 */
export interface ReceivedCatalogProduct {
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly status: CatalogEntryStatus;
  readonly audience: CatalogAudience;
  readonly gaps: Readonly<Record<string, readonly string[]>>;
  readonly seq: number;
  readonly receivedAt: Date;
  readonly items: readonly ReceivedCatalogItem[];
}

/**
 * **Ce qui se vend d'une fiche reçue** : ses déclinaisons complètes si elle est
 * active, rien sinon.
 *
 * C'est la décision de forme du lot 2 : `catalog_items` reste la table de ce
 * qui SE VEND. Une fiche inactive ou archivée n'y a aucune ligne en vente — ses
 * lignes passées sont retirées, jamais supprimées, et leurs décisions
 * attendent la réactivation.
 */
export function itemsOnSale(product: ReceivedCatalogProduct): readonly ReceivedCatalogItem[] {
  return product.status === "active" ? product.items : [];
}
