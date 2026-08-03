import { z } from "zod";

import { billingAddressPayloadSchema } from "./address.js";

/**
 * Contrat de fil des **points de retrait** (laboratoires) — adresses **globales**
 * (pas par entreprise), fallback d'acheminement tant que la livraison n'existe
 * pas. Plusieurs points possibles, un seul par défaut.
 */

/** Charge de création/édition d'un point de retrait : champs postaux + défaut. */
export const pickupAddressPayloadSchema = billingAddressPayloadSchema.extend({
  isDefault: z.boolean().default(false),
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
}

/** Réponse de création d'un point de retrait. */
export interface CreatedPickupResponse {
  readonly id: string;
}
