import { z } from "zod";

import { hasWindowWhenPickedUp, orderOfferSchema, pickupWindowIssue } from "./admin-order.js";
import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  orderContentShape,
  pickupPointIssue,
} from "./order.js";

/**
 * Contrat de fil de la **commande offerte à un particulier**, saisie par
 * l'équipe (`POST /admin/offered-orders/particular` ;
 * `documentation/commandes/passation/plan-commande-offerte.md`, § 2.4, O7-1).
 *
 * Une route à part de `POST /admin/orders`, qui garde sa société obligatoire.
 * Aucun champ de règlement : la route offre, donc le motif (`offer`) est
 * toujours exigé. Ni société, ni marque d'approvisionnement, ni origine de
 * saisie : le serveur les pose. Retrait, ou livraison à une adresse dictée,
 * que la composition juge pour la clientèle des particuliers.
 */
export const offeredParticularOrderPayloadSchema = z
  .object({
    /** La fiche choisie à la recherche des particuliers — vérifiée au serveur. */
    buyerUserId: z.string().trim().min(1, "client requis"),
    offer: orderOfferSchema,
    ...orderContentShape,
    // Le TTC vu à l'écran : zéro, puisque la commande est offerte.
    expectedTotalCents: expectedTotalCentsSchema,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue());
export type OfferedParticularOrderPayload = z.infer<typeof offeredParticularOrderPayloadSchema>;

/**
 * **Ce que l'estimation de la commande offerte reçoit**
 * (`POST /admin/offered-orders/particular/estimate`) : la passation, sans le
 * total vu, et le motif **facultatif**. L'écran estime dès que le panier se
 * compose, avant que le motif soit écrit : sans motif, le serveur chiffre la
 * valeur pleine ; avec, il rend zéro et la valeur offerte — la règle de
 * l'estimation de la saisie pour une société.
 */
export const offeredParticularOrderEstimatePayloadSchema = z
  .object({
    buyerUserId: z.string().trim().min(1, "client requis"),
    offer: orderOfferSchema.optional(),
    ...orderContentShape,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue());
export type OfferedParticularOrderEstimatePayload = z.infer<
  typeof offeredParticularOrderEstimatePayloadSchema
>;

/** Ce que la passation rend : la commande, son total (zéro) et la valeur offerte TTC. */
export interface OfferedParticularPlacedOrderResponse {
  readonly id: string;
  readonly orderNumber: string;
  readonly totalCents: number;
  readonly offeredTotalCents: number;
}
