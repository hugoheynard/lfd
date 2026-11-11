import { z } from "zod";

import type { PromotionEffectKindValue } from "./promotions.js";

/**
 * **La grille de prix d'un public** — l'export d'une plaquette
 * (`documentation/pricing/export-grille-de-prix.md`).
 *
 * Lecture seule : aucun prix n'est écrit, aucune règle ne change. Chaque prix
 * passe par la porte du prix, à la date demandée, pour le public demandé.
 */

/**
 * Pour qui. Les publics que la porte du prix sait servir sans société
 * (particuliers inscrits, invités), un **pro type** (société active, ou en
 * cours d'inscription — § 6 : aucune société, ses faits d'audience
 * déclarés par le staff), ou une société précise — sa mercuriale et son
 * réglage de promotions s'appliquent alors.
 */
export const priceGridAudienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pro_active") }),
  z.object({ kind: z.literal("pro_pending") }),
  z.object({ kind: z.literal("individuals_registered") }),
  z.object({ kind: z.literal("individuals_guest") }),
  z.object({ kind: z.literal("company"), companyId: z.string().trim().min(1) }),
]);
export type PriceGridAudience = z.infer<typeof priceGridAudienceSchema>;

/** Comment le public reçoit : un point de retrait, ou une zone de livraison. */
export const priceGridFulfillmentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("pickup"), pickupId: z.string().trim().min(1) }),
  z.object({ method: z.literal("delivery"), zoneId: z.string().trim().min(1) }),
]);
export type PriceGridFulfillment = z.infer<typeof priceGridFulfillmentSchema>;

/** Le jour, `AAAA-MM-JJ`, à l'heure de Paris. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/** La question commune aux deux lectures : qui, quand, comment. */
export const priceGridQuestionSchema = z.object({
  audience: priceGridAudienceSchema,
  /** `null` = maintenant ; sinon le jour, lu à 00 h 00 heure de Paris. */
  day: z.string().regex(DAY_PATTERN, "jour AAAA-MM-JJ attendu").nullable(),
  fulfillment: priceGridFulfillmentSchema,
});
export type PriceGridQuestion = z.infer<typeof priceGridQuestionSchema>;

/**
 * Ce qu'on fait d'une remise au panier retenue : une colonne à part (son
 * pourcentage ou son montant), appliquée article par article dans le prix net
 * estimé, ou ignorée (nommée en tête, sans effet).
 */
export const PRICE_GRID_BASKET_PARTS = ["column", "net", "ignored"] as const;
export type PriceGridBasketPart = (typeof PRICE_GRID_BASKET_PARTS)[number];

/** Au-delà, une plaquette ne se lit plus — et la caisse n'en cumule que cinq. */
export const PRICE_GRID_MAX_BASKET_PROMOTIONS = 20;

export const priceGridExportPayloadSchema = priceGridQuestionSchema.extend({
  /** Les remises au panier retenues ; une promotion décochée est absente. */
  basketPromotions: z
    .array(
      z.object({
        promotionId: z.string().trim().min(1),
        part: z.enum(PRICE_GRID_BASKET_PARTS),
      }),
    )
    .max(PRICE_GRID_MAX_BASKET_PROMOTIONS),
  /** Ajoute le prix au kilo SAISI de la déclinaison, quand il existe. */
  pricePerKg: z.boolean(),
});
export type PriceGridExportPayload = z.infer<typeof priceGridExportPayloadSchema>;

/** Une promotion que ce public reçoit à cette date et pour cet acheminement. */
export interface PriceGridPromotionView {
  readonly id: string;
  /** Le libellé que CE public lit, en français. */
  readonly label: string;
  readonly effect: { readonly kind: PromotionEffectKindValue; readonly value: number };
  readonly cumulative: boolean;
}

/**
 * Les promotions applicables. Celles du prix affiché sont DANS le prix de
 * l'article — listées pour mémoire ; celles du panier se choisissent.
 */
export interface PriceGridPromotionsView {
  /** L'assiette des prix de la grille : HT pour un pro, TTC pour un particulier. */
  readonly basis: "ht" | "ttc";
  readonly displayedPrice: readonly PriceGridPromotionView[];
  readonly basket: readonly PriceGridPromotionView[];
}
