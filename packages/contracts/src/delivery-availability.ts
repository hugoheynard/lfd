import { z } from "zod";

import { WINDOW_MODES } from "./delivery-availability.values.js";

/**
 * Contrat de fil du **réglage de livraison** : le schéma du patch, et le reste
 * par réexport.
 *
 * Les vues, le défaut, `deliveryOpenTo` et le code de refus vivent dans
 * `delivery-availability.values.ts`, sans zod, pour que la boutique les charge
 * au démarrage sans embarquer le baril (voir l'en-tête de ce module).
 * Cf. `documentation/livraisons/clientele/plan-remise-et-livraison-par-clientele.md`, D4.
 */
export {
  DEFAULT_DELIVERY_AVAILABILITY,
  DELIVERY_CLOSED_FOR_AUDIENCE,
  deliveryOpenTo,
  resolveWindowMode,
  WINDOW_MODES,
  type WindowMode,
  type DeliveryAvailabilityView,
  type PublicDeliveryAvailabilityView,
} from "./delivery-availability.values.js";

/** Un patch : seules les clés présentes changent, et il en faut au moins une. */
export const deliveryAvailabilityPatchSchema = z
  .object({
    openToB2b: z.boolean().optional(),
    openToB2c: z.boolean().optional(),
    /** Créneau ou échéance, par défaut pour toute adresse qui hérite (CA-D2). */
    windowMode: z.enum(WINDOW_MODES).optional(),
    /**
     * Marges de production, en minutes (plan production par vagues, V0) :
     * `null` efface le réglage. La borne vit dans le domaine.
     */
    deliveryMarginMinutes: z.number().int().nullable().optional(),
    pickupMarginMinutes: z.number().int().nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message:
      "au moins un réglage à changer : openToB2b, openToB2c, windowMode, deliveryMarginMinutes ou pickupMarginMinutes",
  });
export type DeliveryAvailabilityPatch = z.infer<typeof deliveryAvailabilityPatchSchema>;
