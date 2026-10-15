import type { CatalogEntryStatus, EntryVariant } from "../catalog-product-facts.js";
import type { CatalogAudience } from "../served-to.js";

/** Une fiche reçue du référentiel (`catalog_entries`). */
export interface PublishedEntryRow {
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly status: CatalogEntryStatus;
  readonly audience: CatalogAudience;
  /** `null` = fait d'avant le lot 3 : on ne sait pas. */
  readonly audienceInherited: boolean | null;
  readonly gaps: Readonly<Record<string, readonly string[]>>;
  /** Les déclinaisons complètes du dernier fait, vendues ou non. */
  readonly variants: readonly EntryVariant[];
  readonly receivedAt: Date;
}

/** Une déclinaison EN VENTE sur la plateforme (`catalog_items`, retirés exclus). */
export interface PublishedItemRow {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly isDefault: boolean;
  readonly position: number;
  readonly audience: CatalogAudience | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly isHidden: boolean;
  readonly isHiddenPublic: boolean;
  /** Le HT pro servi, en millicentimes : la décision, sinon le prix reçu. */
  readonly proHtMillicents: number;
  /** Le taux pro de l'article — `null` = pas facturable aux pros. */
  readonly vatRatePercent: number | null;
  /** L'étiquette publique servie, en centimes TTC — `null` = aucune (contexte public absent). */
  readonly publicTtcCents: number | null;
  readonly receivedAt: Date;
}

/** Une famille connue de la plateforme (`catalog_categories`). */
export interface PublishedFamilyRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly audience: CatalogAudience | null;
  readonly withdrawn: boolean;
}

/** Les trois lectures, prises ensemble. */
export interface PublishedCatalogSource {
  readonly entries: readonly PublishedEntryRow[];
  readonly items: readonly PublishedItemRow[];
  readonly families: readonly PublishedFamilyRow[];
}

/**
 * **Port de lecture de la vue « Catalogue publié »** (lot 3). Distinct de
 * `CatalogAdminReader` (ISP) : celle-ci part des FICHES reçues, vendues ou non,
 * là où l'autre ne voit que les articles en vente.
 */
export abstract class PublishedCatalogReader {
  abstract read(): Promise<PublishedCatalogSource>;
}
