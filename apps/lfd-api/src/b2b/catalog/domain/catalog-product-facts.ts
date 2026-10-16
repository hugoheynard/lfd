import type { PimFacts } from "./entities/catalog-item.js";
import type { ShopAudience } from "./ports/catalog.reader.js";
import { audienceIncludes, type CatalogAudience } from "./served-to.js";

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
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
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
  /** Hérite-t-elle l'audience de sa famille ? `null` = fait d'avant le lot 3. */
  readonly audienceInherited: boolean | null;
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

/**
 * Une ligne neuve attend-elle d'être validée pour cette audience ?
 *
 * Seulement si son audience la contient (lot 3 ; côté pro aussi depuis la
 * décision de Hugo du 2026-10-15). Une ligne née `pro` n'attend rien côté
 * public : l'y mettre en attente la ferait attendre le jour où son audience
 * s'élargit, ce que le plan exclut (« pas pour un élargissement d'audience »).
 */
export function awaitsReview(audience: CatalogAudience, viewer: ShopAudience): boolean {
  return audienceIncludes(audience, viewer);
}

/**
 * Une déclinaison COMPLÈTE telle que l'entrée de la fiche la range (lot 3) :
 * ce que la vue « Catalogue publié » montre d'une fiche dont rien n'est en
 * vente — inactive, ou pas encore reçue en `catalog_items`. Les prix sont
 * ceux que le référentiel PROPOSE, sans décision de la plateforme.
 */
export interface EntryVariant {
  readonly sku: string;
  readonly name: string;
  readonly isDefault: boolean;
  /** Le prix pro HT proposé, en millicentimes. */
  readonly proHtMillicents: number;
  /** L'étiquette publique proposée, en centimes TTC — `null` si le fait n'en porte pas. */
  readonly publicTtcCents: number | null;
}

/** Les déclinaisons complètes d'une fiche reçue, dans la forme de son entrée. */
export function entryVariantsOf(product: ReceivedCatalogProduct): readonly EntryVariant[] {
  return product.items.map((item) => ({
    sku: item.sku,
    name: item.name,
    isDefault: item.isDefault,
    proHtMillicents: item.priceMillicents,
    publicTtcCents: item.publicTtcCents,
  }));
}
