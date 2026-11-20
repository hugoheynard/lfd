import { z } from "zod";

import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  pickupPointIssue,
} from "./order.js";
import { hasWindowWhenPickedUp, pickupWindowIssue } from "./admin-order.js";

/**
 * Contrat de fil de la **commande d'un particulier notée au comptoir**, à
 * régler à la caisse de la boutique
 * (`documentation/commandes/passation/commande-particulier-reglee-en-boutique.md`, § 4–5).
 *
 * Aucun champ de règlement : le lieu (la caisse de la boutique) est implicite
 * à la route, donc inexprimable autrement (§ 4.4). Ni société, ni origine de
 * saisie, ni marque d'approvisionnement : le serveur les pose. L'acheminement
 * reste au contrat parce que c'est la forme commune des paniers ; le domaine
 * refuse toute livraison, en la nommant.
 */
const counterParticularOrderEntryShape = {
  /** La fiche choisie à la recherche du comptoir — un particulier, vérifié au serveur. */
  buyerUserId: z.string().trim().min(1, "client requis"),
  ...orderContentShape,
};

/** Ce que reçoit l'estimation : la passation, sans le total vu. */
export const counterParticularOrderEstimatePayloadSchema = z
  .object(counterParticularOrderEntryShape)
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue());
export type CounterParticularOrderEstimatePayload = z.infer<
  typeof counterParticularOrderEstimatePayloadSchema
>;

/** Ce que reçoit la passation : le panier et le total TTC que l'estimation a montré. */
export const counterParticularOrderPayloadSchema = z
  .object({
    ...counterParticularOrderEntryShape,
    expectedTotalCents: expectedTotalCentsSchema,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue());
export type CounterParticularOrderPayload = z.infer<typeof counterParticularOrderPayloadSchema>;

/** Ce que la passation rend : la commande, et le TTC à encaisser sur la caisse de la boutique. */
export interface CounterParticularPlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
}
