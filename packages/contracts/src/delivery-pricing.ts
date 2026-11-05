import { z } from "zod";

import { cartAdjustmentSchema } from "./cart-adjustment.js";

/**
 * Contrat de fil du **réglage de livraison par audience** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0a) : le frais
 * de base et le franco — le seuil HT, en centimes, au-delà duquel la livraison
 * est offerte — pour les pros (`b2b`) et les particuliers (`b2c`).
 *
 * Le même couple sert au réglage GLOBAL et au REMPLACEMENT d'une zone. Chaque
 * valeur est nullable : `null` = rien de réglé à ce niveau (pour une zone :
 * elle reprend le global). Posé en 0a ; le calcul du frais ne le lit qu'au 0b.
 */

/** Ce qu'une audience paie pour être livrée, à un niveau (global ou zone). */
export const deliveryAudienceTermsSchema = z.object({
  fee: cartAdjustmentSchema.nullable(),
  /** Seuil HT en centimes ; la borne (jamais négatif) vit dans le domaine. */
  freeDeliveryThresholdCents: z.number().int().nullable(),
});
export type DeliveryAudienceTerms = z.infer<typeof deliveryAudienceTermsSchema>;

/** Les deux audiences, à un niveau. */
export const deliveryPricingTermsSchema = z.object({
  b2b: deliveryAudienceTermsSchema,
  b2c: deliveryAudienceTermsSchema,
});
export type DeliveryPricingTerms = z.infer<typeof deliveryPricingTermsSchema>;

/** Rien de réglé, pour une audience. */
export const UNSET_DELIVERY_AUDIENCE_TERMS: DeliveryAudienceTerms = {
  fee: null,
  freeDeliveryThresholdCents: null,
};

/** Le patch d'une audience : seules les clés présentes changent ; `null` efface. */
const deliveryAudienceTermsPatchSchema = z.object({
  fee: cartAdjustmentSchema.nullable().optional(),
  freeDeliveryThresholdCents: z.number().int().nullable().optional(),
});

/** Le patch du réglage global : il faut au moins une valeur à changer. */
export const deliveryPricingPatchSchema = z
  .object({
    b2b: deliveryAudienceTermsPatchSchema.optional(),
    b2c: deliveryAudienceTermsPatchSchema.optional(),
  })
  .refine(
    (patch) =>
      [patch.b2b, patch.b2c].some(
        (terms) =>
          terms !== undefined &&
          (terms.fee !== undefined || terms.freeDeliveryThresholdCents !== undefined),
      ),
    {
      message: "au moins un réglage à changer : le frais ou le franco des pros ou des particuliers",
    },
  );
export type DeliveryPricingPatch = z.infer<typeof deliveryPricingPatchSchema>;

/** Le réglage global tel que le back-office le lit (`GET /admin/delivery-pricing`). */
export interface DeliveryPricingView {
  readonly b2b: DeliveryAudienceTerms;
  readonly b2c: DeliveryAudienceTerms;
  /** Instant ISO du dernier geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  /** Nom figé de l'auteur ; `null` si personne ou si l'annuaire ne le connaissait pas. */
  readonly updatedBy: string | null;
}

/** Ligne absente : aucun réglage global. */
export const DEFAULT_DELIVERY_PRICING: DeliveryPricingView = {
  b2b: UNSET_DELIVERY_AUDIENCE_TERMS,
  b2c: UNSET_DELIVERY_AUDIENCE_TERMS,
  updatedAt: null,
  updatedBy: null,
};
