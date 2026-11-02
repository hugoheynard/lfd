import { z } from "zod";

/**
 * **Les articles sur mesure et leur réservation**, vus du back-office (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a).
 *
 * Un article peut être réservé à une liste de sociétés. Depuis R3-1
 * (2026-11-02, § 13), « sur mesure » est un FAIT de la fiche du référentiel
 * (`isCustomRecipe`), que ces vues relaient ; sans réservation, un article sur
 * mesure n'est servi à aucun pro (D3).
 */

/**
 * Ce que voient les pros NON réservataires d'un article réservé — une valeur
 * de donnée, rangée telle quelle en base.
 *
 * - `hidden` : absent, comme un SKU inconnu (le défaut) ;
 * - `visible_locked` : listé, non commandable.
 */
export const RESERVED_VISIBILITIES = ["hidden", "visible_locked"] as const;
export type ReservedVisibility = (typeof RESERVED_VISIBILITIES)[number];

// Le geste « Sur mesure… » du commerce (`PUT admin/catalog/:sku/made-to-order`)
// est retiré par R3-1 (2026-11-02, § 13 D2) : le sur mesure est un fait de la
// fiche, posé au référentiel (`PUT /pim/catalogue/products/:id/custom-recipe`).

/** Régler la visibilité d'un article réservé (`PUT admin/catalog/:sku/reserved-visibility`). */
export const setReservedVisibilityPayloadSchema = z.object({
  visibility: z.enum(RESERVED_VISIBILITIES),
});
export type SetReservedVisibilityPayload = z.infer<typeof setReservedVisibilityPayloadSchema>;

/**
 * Le réglage d'un article qui en porte un — sur mesure (fait de la fiche), ou
 * réservé à au moins une société (`GET admin/catalog/made-to-order`). Les autres n'y sont pas :
 * l'écran les joint au catalogue par SKU, et un article absent n'a rien de
 * réglé.
 */
export interface MadeToOrderMarkView {
  readonly sku: string;
  /** Le fait de la fiche (§ 13, D1) — « Sur mesure » à l'écran. */
  readonly isCustomRecipe: boolean;
  readonly reservedVisibility: ReservedVisibility;
  /**
   * Le nombre de sociétés réservataires — `0` : ouvert à tous les pros, sauf
   * s'il est sur mesure (« à attribuer », servi à aucun pro, D3).
   */
  readonly reservationCount: number;
}

/** Une société réservataire d'un article, telle que l'écran la nomme. */
export interface ArticleReservationHolderView {
  readonly companyId: string;
  /** Le nom d'affichage de la société ; `null` si l'identifiant ne désigne plus aucune société. */
  readonly companyName: string | null;
  readonly reservedAt: string;
  /** « Prénom Nom » de qui a réservé ; `null` si la valeur ne désigne aucune fiche staff. */
  readonly reservedByName: string | null;
}

/** Le réglage complet d'un article (`GET admin/catalog/:sku/reservation`). */
export interface ArticleReservationView {
  readonly sku: string;
  readonly name: string;
  /** Le fait de la fiche (§ 13, D1) — « Sur mesure » à l'écran. */
  readonly isCustomRecipe: boolean;
  readonly reservedVisibility: ReservedVisibility;
  readonly holders: readonly ArticleReservationHolderView[];
}

/** Un article réservé, vu de la fiche d'une société. */
export interface ReservedArticleView {
  readonly sku: string;
  readonly name: string;
  /** Le fait de la fiche (§ 13, D1) — « Sur mesure » à l'écran. */
  readonly isCustomRecipe: boolean;
  readonly reservedVisibility: ReservedVisibility;
  readonly reservedAt: string;
  readonly reservedByName: string | null;
}

/**
 * Les articles réservés à une société (`GET admin/catalog/reservations/:companyId`)
 * — les siens, et ceux de son principal, qui s'ouvrent à ses sites (Q3).
 */
export interface CompanyReservedArticlesView {
  readonly own: readonly ReservedArticleView[];
  /**
   * Le principal de la société et ce qui lui est réservé — `null` pour une
   * société sans principal. En lecture seule ici : une réservation du principal
   * se retire sur SA fiche.
   *
   * `active: false` : le principal n'est pas actif, et ses réservations ne
   * s'ouvrent pas à ce site (Q8).
   */
  readonly principal: {
    readonly companyId: string;
    readonly name: string;
    readonly active: boolean;
    readonly articles: readonly ReservedArticleView[];
  } | null;
}
