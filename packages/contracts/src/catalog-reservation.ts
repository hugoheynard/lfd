import { z } from "zod";

/**
 * **Les articles sur mesure et leur réservation**, vus du back-office (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a).
 *
 * Un article peut être marqué « sur mesure » et réservé à une liste de
 * sociétés. Ce contrat ne porte que le RÉGLAGE : le mur qui en tire les
 * conséquences au rayon, au devis et à la commande est le lot L1b — tant
 * qu'il n'est pas déployé, une réservation ne restreint rien.
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

/** Marquer un article « sur mesure », ou l'en démarquer (`PUT admin/catalog/:sku/made-to-order`). */
export const setMadeToOrderPayloadSchema = z.object({ madeToOrder: z.boolean() });
export type SetMadeToOrderPayload = z.infer<typeof setMadeToOrderPayloadSchema>;

/** Régler la visibilité d'un article réservé (`PUT admin/catalog/:sku/reserved-visibility`). */
export const setReservedVisibilityPayloadSchema = z.object({
  visibility: z.enum(RESERVED_VISIBILITIES),
});
export type SetReservedVisibilityPayload = z.infer<typeof setReservedVisibilityPayloadSchema>;

/**
 * Le réglage d'un article qui en porte un — sur mesure, ou réservé à au moins
 * une société (`GET admin/catalog/made-to-order`). Les autres n'y sont pas :
 * l'écran les joint au catalogue par SKU, et un article absent n'a rien de
 * réglé.
 */
export interface MadeToOrderMarkView {
  readonly sku: string;
  readonly isMadeToOrder: boolean;
  readonly reservedVisibility: ReservedVisibility;
  /** Le nombre de sociétés réservataires — `0` : ouvert à tous les pros. */
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
  readonly isMadeToOrder: boolean;
  readonly reservedVisibility: ReservedVisibility;
  readonly holders: readonly ArticleReservationHolderView[];
}

/** Un article réservé, vu de la fiche d'une société. */
export interface ReservedArticleView {
  readonly sku: string;
  readonly name: string;
  readonly isMadeToOrder: boolean;
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
