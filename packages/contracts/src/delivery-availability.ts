import { z } from "zod";

/**
 * Contrat de fil du **réglage de livraison** : le schéma du patch, et le reste
 * par réexport.
 *
 * Les vues, le défaut, `deliveryOpenTo` et le code de refus vivent dans
 * `delivery-availability.values.ts`, sans zod, pour que la boutique les charge
 * au démarrage sans embarquer le baril (voir l'en-tête de ce module).
 * Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4.
 */
export {
  DEFAULT_DELIVERY_AVAILABILITY,
  DELIVERY_CLOSED_FOR_AUDIENCE,
  deliveryOpenTo,
  type DeliveryAvailabilityView,
  type PublicDeliveryAvailabilityView,
} from "./delivery-availability.values.js";

/** Un patch : seules les clés présentes changent, et il en faut au moins une. */
export const deliveryAvailabilityPatchSchema = z
  .object({
    openToB2b: z.boolean().optional(),
    openToB2c: z.boolean().optional(),
  })
  .refine((patch) => patch.openToB2b !== undefined || patch.openToB2c !== undefined, {
    message: "au moins une clientèle à changer : openToB2b ou openToB2c",
  });
export type DeliveryAvailabilityPatch = z.infer<typeof deliveryAvailabilityPatchSchema>;
