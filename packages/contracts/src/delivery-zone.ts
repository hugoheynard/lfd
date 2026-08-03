import { z } from "zod";

import { cartAdjustmentSchema, type CartAdjustment } from "./cart-adjustment.js";

/**
 * Contrat de fil des **zones de livraison** — un **secteur** de codes postaux
 * (stations éloignées : Val d'Isère, Tignes…) portant un **frais de livraison** HT
 * ajouté au panier quand la commande est livrée vers ce secteur. Config **globale**
 * (pas par entreprise), éditée dans « Réglages → Retraits & livraisons ».
 *
 * Une zone couvre une **liste de préfixes** de code postal : un préfixe complet
 * (`73150`) matche un code exact, un préfixe court (`731`) matche tout le secteur
 * (Tarentaise). En cas de chevauchement, **le préfixe le plus long gagne** (le plus
 * spécifique) — cf. {@link longestMatchingPrefix}.
 */

/** Charge de création/édition d'une zone : préfixes de code postal, libellé, frais. */
export const deliveryZonePayloadSchema = z.object({
  postalPrefixes: z
    .array(z.string().trim().regex(/^\d{2,5}$/u, "2 à 5 chiffres"))
    .min(1, "au moins un code postal"),
  label: z.string().trim().max(120).default(""),
  fee: cartAdjustmentSchema,
});
export type DeliveryZonePayload = z.infer<typeof deliveryZonePayloadSchema>;

/** Une zone de livraison telle que renvoyée. */
export interface DeliveryZoneView {
  readonly id: string;
  /** Les préfixes de code postal couverts (un `73150` exact, un `731` = secteur). */
  readonly postalPrefixes: readonly string[];
  readonly label: string;
  readonly fee: CartAdjustment;
}

/** Réponse de création d'une zone de livraison. */
export interface CreatedDeliveryZoneResponse {
  readonly id: string;
}

/**
 * Longueur du **plus long** préfixe de la liste qui préfixe `codePostal`, ou `-1`
 * si aucun. Sert à départager les zones (le préfixe le plus long, donc le plus
 * spécifique, gagne).
 */
export function longestMatchingPrefix(
  prefixes: readonly string[],
  codePostal: string,
): number {
  let best = -1;
  for (const prefix of prefixes) {
    if (codePostal.startsWith(prefix) && prefix.length > best) {
      best = prefix.length;
    }
  }
  return best;
}
