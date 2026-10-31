import { z } from "zod";

/**
 * **La politique de promotions d'une mercuriale** — ce que le commercial a
 * promis à son client : prix négocié net, ou prix négociés + promotions
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 7 et § 8).
 *
 * Datée par le mécanisme de la mercuriale : posée avec elle (et sur son
 * brouillon), changée par un avenant à sa date d'effet. Elle ne vaut que sur
 * les articles que la mercuriale fixe, à partir de leur premier palier.
 */
export const MERCURIALE_PROMOTION_MODE_VALUES = ["none", "all", "selected"] as const;
export type MercurialePromotionModeValue = (typeof MERCURIALE_PROMOTION_MODE_VALUES)[number];

/**
 * La forme seulement : la cohérence mode ↔ liste (liste en `selected`
 * seulement, et non vide) est un refus du domaine.
 */
export const mercurialePromotionPolicySchema = z.object({
  mode: z.enum(MERCURIALE_PROMOTION_MODE_VALUES),
  promotionIds: z.array(z.string().min(1)).max(200).default([]),
});
export type MercurialePromotionPolicyPayload = z.infer<typeof mercurialePromotionPolicySchema>;

/** Une politique telle que la lecture la rend — liste triée, vide hors `selected`. */
export interface MercurialePromotionPolicyView {
  readonly mode: MercurialePromotionModeValue;
  readonly promotionIds: readonly string[];
}

/** Une mercuriale qui accepte une promotion donnée — le renvoi de la page de promotion. */
export interface AcceptingMercurialeView {
  readonly mercurialeId: string;
  readonly companyId: string;
  readonly label: string;
  readonly mode: Exclude<MercurialePromotionModeValue, "none">;
}

/**
 * `GET admin/pricing/mercuriales/accepting-promotion/:promotionId` — « Clients
 * à tarif négocié : N mercuriales l'acceptent » (§ 7). Lecture seule : le
 * réglage reste du côté de la mercuriale. Mercuriales en cours ou à venir,
 * chacune à sa politique d'aujourd'hui (ou de son début, si elle n'a pas
 * commencé).
 */
export interface MercurialesAcceptingPromotionView {
  readonly promotionId: string;
  readonly count: number;
  readonly mercuriales: readonly AcceptingMercurialeView[];
}
