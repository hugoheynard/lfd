import type { ReceivedCatalogProduct } from "../catalog-product-facts.js";
import type { PimFacts } from "../entities/catalog-item.js";
import type { CatalogAudience } from "../served-to.js";
import type { CatalogCategoryFacts } from "./catalog-category.projection.js";

/**
 * **Ce que le fait d'une fiche écrit sur la plateforme** (2a4 de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`).
 *
 * Une PROJECTION d'un fait d'un autre contexte, pas un agrégat : aucune règle
 * de la plateforme ne peut refuser ce que le référentiel dit de sa fiche. Ce
 * qu'elle garantit tient dans ses signatures :
 *
 * - **aucune décision locale n'y entre** — ni prix décidé, ni masquage, ni
 *   mise en avant (`catalog_item_overrides`) : aucune méthode ne les porte, et
 *   l'adaptateur n'écrit pas cette table (H10) ;
 * - **rien ne se supprime** — un article qui ne se vend plus est retiré
 *   (`withdrawnAt`), sa ligne et ses décisions l'attendent ;
 * - **l'ordre est tenu en base** — `recordEntryIfNewer` est une écriture
 *   conditionnée sur `applied_seq`, la seule qui ne laisse pas deux livraisons
 *   se doubler. Les trois autres ne s'appellent que si elle a écrit.
 *
 * Toutes suivent la transaction de la livraison, qui porte aussi son reçu.
 */
export abstract class CatalogProductFactsProjection {
  /**
   * Écrit l'entrée de la fiche si ce fait est plus récent que ce qu'elle
   * porte (ou si elle n'existe pas). `false` = un fait plus récent est déjà
   * appliqué : ce fait-ci n'écrit rien d'autre.
   */
  abstract recordEntryIfNewer(product: ReceivedCatalogProduct): Promise<boolean>;

  /**
   * Crée la famille si la plateforme ne la connaît pas encore ; **ne la met
   * jamais à jour** — c'est le fait famille, sous son propre numéro, qui le
   * fait. Une fiche peut arriver avant sa famille.
   */
  abstract ensureFamily(family: CatalogCategoryFacts): Promise<void>;

  /**
   * Met en vente (ou y laisse) ces articles : faits du référentiel réécrits,
   * `withdrawnAt` remis à `null`, audience posée. Les décisions locales ne
   * sont pas touchées ; les limites de commande non plus (règles globales,
   * lot 4). Trace le prix effectif s'il change, comme toute écriture de prix.
   */
  abstract putOnSale(items: readonly PimFacts[], audience: CatalogAudience): Promise<void>;

  /**
   * Retire de la vente les articles de la fiche dont le SKU n'est pas dans
   * `keptSkus` et qui y sont encore — une fiche inactive retire tout, un SKU
   * renommé retire l'ancien. Rien n'est supprimé.
   */
  abstract withdrawOthers(productId: string, keptSkus: readonly string[], at: Date): Promise<void>;
}
