import { z } from "zod";

import {
  billingAddressPayloadSchema,
  type FulfillmentWindow,
  fulfillmentWindowSchema,
} from "./address.js";
import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";

/**
 * Contrat de fil des **points de retrait** (laboratoires) — adresses **globales**
 * (pas par entreprise), fallback d'acheminement tant que la livraison n'existe
 * pas. Plusieurs points possibles, un seul par défaut. Chaque point peut porter
 * une **remise** (retirer coûte moins cher : ex. labo −20 %) appliquée au panier
 * quand la commande est retirée là.
 */

/**
 * Les heures où un professionnel peut venir chercher sa commande.
 *
 * **Deux fenêtres nommées, jamais fusionnées.** L'ouverture au public et le
 * créneau réservé aux pros ne se touchent pas forcément — 5h–6h30 pour les pros
 * puis 7h–20h au public laisse une demi-heure fermée. Les aplatir en un seul
 * « range total » inventerait une disponibilité qui n'existe pas, et un client
 * se présenterait devant une porte close.
 *
 * La disponibilité se lit donc « contenue dans **l'une** des deux ».
 */
export const pickupOpeningSchema = z.object({
  /** Ouverture au public. `null` = le point ne reçoit pas de public. */
  publicOpening: fulfillmentWindowSchema.nullable().default(null),
  /** Créneau réservé au retrait pro. `null` = pas de créneau dédié. */
  proPickup: fulfillmentWindowSchema.nullable().default(null),
});
export type PickupOpening = z.infer<typeof pickupOpeningSchema>;

/**
 * Les fenêtres où un pro peut se présenter, la plus matinale en tête. Vide = le
 * point n'a aucune heure déclarée — l'écran doit alors le dire plutôt que
 * d'accepter n'importe quelle heure.
 */
export function pickupWindows(opening: PickupOpening): readonly FulfillmentWindow[] {
  return [opening.proPickup, opening.publicOpening]
    .filter((window): window is FulfillmentWindow => window !== null)
    .sort((a, b) => (a.start ?? "00:00").localeCompare(b.start ?? "00:00"));
}

/** Charge de création/édition d'un point de retrait : champs postaux + défaut +
 *  remise optionnelle (`null` = aucune remise) + heures d'ouverture. */
export const pickupAddressPayloadSchema = billingAddressPayloadSchema.extend({
  isDefault: z.boolean().default(false),
  discount: cartAdjustmentSchema.nullable().default(null),
  opening: pickupOpeningSchema.default({ publicOpening: null, proPickup: null }),
});
export type PickupAddressPayload = z.infer<typeof pickupAddressPayloadSchema>;

/** Un point de retrait tel que renvoyé (le défaut en tête). */
export interface PickupAddressView {
  readonly id: string;
  readonly label: string;
  readonly ligne1: string;
  readonly ligne2: string;
  readonly codePostal: string;
  readonly ville: string;
  readonly pays: string;
  readonly isDefault: boolean;
  /** Remise appliquée au panier en cas de retrait ici, ou `null`. */
  readonly discount: CartAdjustment | null;
  /** Quand on peut venir — cf. {@link pickupOpeningSchema}. */
  readonly opening: PickupOpening;
}

/** Réponse de création d'un point de retrait. */
export interface CreatedPickupResponse {
  readonly id: string;
}
