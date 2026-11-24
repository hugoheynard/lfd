import type { CatalogTranslations } from "./catalog-translations.js";
import type { PimFacts } from "./entities/catalog-item.js";
import type { ShopAudience } from "./ports/catalog.reader.js";
import { audienceIncludes, CATALOG_AUDIENCES, type CatalogAudience } from "./served-to.js";

/**
 * Un article reçu par le fait de sa fiche : les faits d'un article, plus
 * l'identifiant de sa déclinaison au référentiel — qu'une règle de limite de
 * commande de rang « déclinaison » vise (lot 2b). Le push ne le porte pas.
 */
export interface ReceivedCatalogItem extends PimFacts {
  readonly variantId: string;
  /**
   * L'audience de CET article — celle que le fait porte pour sa déclinaison,
   * sinon celle de l'en-tête (fait d'avant le champ ;
   * `plan-audience-par-declinaison.md`, A6).
   */
  readonly audience: CatalogAudience;
  /**
   * Les traductions du nom de la déclinaison et de la ligne de la fiche (lot
   * des langues). `null` = fait émis avant elles : on ne sait pas, et la
   * vitrine sert le français.
   */
  readonly nameTranslations: CatalogTranslations | null;
  readonly noteTranslations: CatalogTranslations | null;
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
 * public : elle attendra le jour où son audience s'élargit au public
 * ({@link reviewReopenedBy}).
 */
export function awaitsReview(audience: CatalogAudience, viewer: ShopAudience): boolean {
  return audienceIncludes(audience, viewer);
}

/**
 * L'audience d'un article existant **s'élargit-elle** à cette clientèle ? Alors
 * il attend de nouveau d'être validé pour elle — décidé par Hugo le 2026-11-24
 * (`plan-audience-par-declinaison.md`, Q1), pour une fiche comme pour une
 * déclinaison : un geste du staff au référentiel reste un geste à regarder
 * avant la vitrine. Une colonne vide se lit `both` (`audienceIncludes`) : elle
 * ne s'élargit donc jamais.
 */
export function reviewReopenedBy(
  previous: CatalogAudience | null,
  next: CatalogAudience,
  viewer: ShopAudience,
): boolean {
  return !audienceIncludes(previous, viewer) && audienceIncludes(next, viewer);
}

/**
 * **Ce que l'élargissement rouvre, pour une clientèle**, dans la forme d'une
 * écriture conditionnée : les articles reçus qui la servent désormais, et les
 * audiences d'avant qui ne la servaient pas ({@link reviewReopenedBy}). Une
 * ligne en base dont l'audience est dans `from` et le SKU dans `skus`
 * s'élargit — c'est elle, et elle seule, qui repasse en attente.
 */
export function reopenedReviewScope(
  items: readonly ReceivedCatalogItem[],
  viewer: ShopAudience,
): { readonly skus: readonly string[]; readonly from: readonly CatalogAudience[] } {
  return {
    skus: items.filter((item) => audienceIncludes(item.audience, viewer)).map((item) => item.sku),
    from: CATALOG_AUDIENCES.filter((previous) => !audienceIncludes(previous, viewer)),
  };
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
  /** Le prix pro HT proposé, en millicentimes — `null` : pas vendable aux pros (2026-10-27). */
  readonly proHtMillicents: number | null;
  /** L'étiquette publique proposée, en centimes TTC — `null` si le fait n'en porte pas. */
  readonly publicTtcCents: number | null;
  /**
   * L'audience de la déclinaison (`plan-audience-par-declinaison.md`, AD1) ;
   * absente d'une entrée écrite avant elle — la cellule lit alors la fiche.
   */
  readonly audience?: CatalogAudience | undefined;
}

/** Les déclinaisons complètes d'une fiche reçue, dans la forme de son entrée. */
export function entryVariantsOf(product: ReceivedCatalogProduct): readonly EntryVariant[] {
  return product.items.map((item) => ({
    sku: item.sku,
    name: item.name,
    isDefault: item.isDefault,
    proHtMillicents: item.priceMillicents,
    publicTtcCents: item.publicTtcCents,
    audience: item.audience,
  }));
}
