import { z } from "zod";

import {
  adminOrderEntryShape,
  hasOfferIffOffered,
  hasOfferOnlyWhenOffered,
  hasWindowWhenPickedUp,
  offerIssue,
  pickupWindowIssue,
} from "./admin-order.js";
import {
  deliveryAddressIssue,
  expectedTotalCentsSchema,
  hasAddressWhenDelivered,
  hasPickupPointWhenPickedUp,
  pickupPointIssue,
} from "./order.js";

/**
 * **Transformer un reliquat en commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4) : le
 * corps de la saisie de l'équipe, SANS la société ni les lignes — reprises du
 * reliquat, aux prix de la commande d'origine. `buyerUserId` est proposé à
 * l'acheteur d'origine et modifiable : un acheteur parti de la société est
 * refusé, l'équipe en choisit un autre.
 *
 * Strict : le port offert et l'absence de surtaxe sont imposés par le
 * serveur, et aucun champ ne permet de les ôter — un champ inconnu est un
 * refus de forme, pas une valeur ignorée.
 */
const backorderEntryShape = z
  .object(adminOrderEntryShape)
  .omit({ companyId: true, lines: true }).shape;

export const adminBackorderConvertPayloadSchema = z
  .strictObject({
    ...backorderEntryShape,
    // Le TTC que l'estimation du reliquat a montré.
    expectedTotalCents: expectedTotalCentsSchema,
  })
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferIffOffered, offerIssue());
export type AdminBackorderConvertPayload = z.infer<typeof adminBackorderConvertPayloadSchema>;

/**
 * **L'estimation de la transformation** : le même corps, sans le total vu —
 * c'est elle qui le montre. Elle rend la vue de l'estimation de la saisie
 * (`AdminOrderEstimateView`).
 */
export const adminBackorderQuotePayloadSchema = z
  .strictObject(backorderEntryShape)
  .refine(hasAddressWhenDelivered, deliveryAddressIssue())
  .refine(hasPickupPointWhenPickedUp, pickupPointIssue())
  .refine(hasWindowWhenPickedUp, pickupWindowIssue())
  .refine(hasOfferOnlyWhenOffered, offerIssue());
export type AdminBackorderQuotePayload = z.infer<typeof adminBackorderQuotePayloadSchema>;
