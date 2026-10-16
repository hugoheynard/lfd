import type { CatalogItemAudience } from "./catalog-admin.js";

/**
 * **La vue « Catalogue publié »** (`GET admin/catalog/published`) — lot 3 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md` (H6, H9) et
 * §7 de `catalogue-synchronise.md`.
 *
 * Elle part des **fiches** reçues du référentiel (`catalog_entries`), pas des
 * seuls articles en vente : une fiche inactive, ou dont aucune déclinaison
 * n'est complète, y paraît — c'est tout son objet, voir le catalogue en train
 * de se construire. Une fiche connue du seul push (sans fait reçu) n'y paraît
 * pas.
 */

/**
 * L'état d'une déclinaison pour UNE audience. Des VALEURS de donnée, pas des
 * noms (CLAUDE.md §8).
 *
 * - `inactif` — la fiche n'est pas active (inactive ou archivée) ; décidé
 *   juste après « hors audience », avant tout manque ;
 * - `en_vente` — servie à cette audience, au prix rendu ;
 * - `masque` — la plateforme l'a retirée (le seul état qui a un geste :
 *   `PUT admin/catalog/:sku/masking`) ;
 * - `pas_vendu` — le référentiel ne la vend pas à cette audience (ou, fiche
 *   active, la plateforme n'a pas encore appliqué sa mise en vente) ;
 * - `en_attente_validation` — arrivée récemment, pas encore validée pour
 *   cette audience (pros et public se valident séparément) ;
 * - `incomplet` — il lui manque de quoi se vendre (`gaps`, ou pas de prix /
 *   de taux pour cette audience).
 */
export const PUBLISHED_CELL_STATES = [
  "inactif",
  "en_vente",
  "masque",
  "pas_vendu",
  "en_attente_validation",
  "incomplet",
] as const;
export type PublishedCellState = (typeof PUBLISHED_CELL_STATES)[number];

/** L'état d'une fiche, dans les mots de l'écran. */
export type PublishedEntryStatus = "inactive" | "active" | "archived";

/** La cellule pro : le prix **HT** en millicentimes, décision comprise. */
export interface PublishedProCellView {
  readonly state: PublishedCellState;
  /**
   * En vente : le prix servi (décision comprise). Sinon le prix PROPOSÉ par le
   * référentiel pour une déclinaison complète. `null` = incomplète, pas de prix.
   */
  readonly htMillicents: number | null;
}

/** La cellule public : l'étiquette **TTC** en centimes, décision comprise. */
export interface PublishedPublicCellView {
  readonly state: PublishedCellState;
  /** Même règle que `htMillicents` ; `null` = aucune étiquette publique. */
  readonly ttcCents: number | null;
}

/** Une déclinaison d'une fiche, et ce que chaque audience en voit. */
export interface PublishedVariantView {
  readonly sku: string;
  /**
   * Le nom de l'article, `null` pour une déclinaison incomplète : le fait ne
   * porte que son SKU et ce qui lui manque.
   */
  readonly name: string | null;
  /** Une ligne en vente sur la plateforme (`catalog_items`) — sinon lue du fait. */
  readonly onSale: boolean;
  readonly isDefault: boolean;
  /** Ce qui lui manque (`[]` = rien) — les codes du référentiel (`price`, `allergens`, `vat:b2b`…). */
  readonly gaps: readonly string[];
  /** En attente de validation, par audience (`true` = pas encore servie à elle). */
  readonly reviewPending: { readonly pro: boolean; readonly public: boolean };
  readonly pro: PublishedProCellView;
  readonly public: PublishedPublicCellView;
}

/** Une fiche reçue du référentiel, vendue ou non. */
export interface PublishedEntryView {
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly status: PublishedEntryStatus;
  /** L'audience EFFECTIVE de la fiche (sa dérogation, sinon sa famille). */
  readonly audience: CatalogItemAudience;
  /**
   * `true` = la fiche hérite l'audience de sa famille ; `false` = elle y
   * déroge (même à l'identique). `null` = fait reçu avant le lot 3, on ne sait
   * pas — « réémettre tout » le remplit.
   */
  readonly audienceInherited: boolean | null;
  /** L'audience de la famille telle que reçue — `null` = jamais reçue. */
  readonly familyAudience: CatalogItemAudience | null;
  /**
   * Les déclinaisons en vente, puis les complètes non vendues (fiche
   * inactive), puis les incomplètes. Un SKU n'y paraît qu'une fois.
   */
  readonly variants: readonly PublishedVariantView[];
  readonly receivedAt: string;
}

/** Combien de déclinaisons dans chaque état, pour une audience. */
export type PublishedCellCounts = Readonly<Record<PublishedCellState, number>>;

/** Un rayon (une famille) et ses comptes par audience. */
export interface PublishedShelfView {
  readonly categoryId: string;
  /** `null` = famille que la plateforme ne connaît pas (ne devrait pas arriver). */
  readonly name: string | null;
  readonly position: number;
  /** Famille retirée au référentiel. */
  readonly withdrawn: boolean;
  readonly pro: PublishedCellCounts;
  readonly public: PublishedCellCounts;
}

/** Un article en attente de validation — le callout. */
export interface PendingReviewView {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  /** Les audiences qui l'attendent (et que son audience contient), jamais vide. */
  readonly audiences: readonly ("pro" | "public")[];
  readonly receivedAt: string;
}

/** La vue entière. */
export interface PublishedCatalogView {
  /** Les rayons dans l'ordre de leur position ; les familles sans fiche y sont (grisées, Q2). */
  readonly shelves: readonly PublishedShelfView[];
  /** Les fiches, rayon par rayon, puis par nom. */
  readonly entries: readonly PublishedEntryView[];
  /** Les articles qui attendent une validation, pour les pros et/ou le public. */
  readonly pendingReview: readonly PendingReviewView[];
}
