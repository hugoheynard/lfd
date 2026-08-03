import { z } from "zod";

import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";

/**
 * Contrat de fil des **zones de livraison** — des **codes postaux** (stations
 * éloignées : Val d'Isère, Tignes…) portant un **frais de livraison** HT ajouté
 * au panier quand la commande est livrée vers ce code postal. Config **globale**
 * (pas par entreprise), éditée dans « Réglages → Retraits & livraisons ».
 */

/** Charge de création/édition d'une zone : code postal, libellé, frais (% ou €). */
export const deliveryZonePayloadSchema = z.object({
  codePostal: z
    .string()
    .trim()
    .regex(/^\d{4,5}$/u, "code postal attendu (4 à 5 chiffres)"),
  label: z.string().trim().max(120).default(""),
  fee: cartAdjustmentSchema,
});
export type DeliveryZonePayload = z.infer<typeof deliveryZonePayloadSchema>;

/** Une zone de livraison telle que renvoyée. */
export interface DeliveryZoneView {
  readonly id: string;
  readonly codePostal: string;
  readonly label: string;
  readonly fee: CartAdjustment;
}

/** Réponse de création d'une zone de livraison. */
export interface CreatedDeliveryZoneResponse {
  readonly id: string;
}
