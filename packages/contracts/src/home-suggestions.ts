import { z } from "zod";

import type { StaffSuggestionView } from "./cart-suggestions.js";

/**
 * ── Les suggestions de l'ACCUEIL de la boutique ─────────────────────────────
 *
 * RS7 (`documentation/recommandation-produit/suggestions-du-staff.md`).
 * Forme seule, comme le panier et la fiche : seul « partout » y déclenche, la
 * place et le filtre sont tenus par le commerce. Le panier courant n'est là
 * que pour ne pas proposer ce qui y est déjà.
 *
 * - `POST /shop/suggestions/home`      ← `HomeSuggestionsPayload` → `HomeSuggestionView[]` (sans jeton)
 * - `POST /shop/suggestions/home/mine` ← `HomeSuggestionsPayload` → `HomeSuggestionView[]` (l'espace courant décide du lecteur)
 */

const MAX_CART_SKUS = 100;
const MAX_TOKEN_LENGTH = 64;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

export const homeSuggestionsPayloadSchema = z.strictObject({
  /** Les SKU au panier — jamais suggérés ; vide admis. */
  skus: z.array(z.string().min(1).max(MAX_TOKEN_LENGTH)).max(MAX_CART_SKUS),
  /** Le jour visé et le point de retrait, si la boutique les connaît ; `null` sinon. */
  target: z
    .strictObject({
      date: isoDay,
      pickupAddressId: z.string().min(1).nullable(),
    })
    .nullable(),
});
export type HomeSuggestionsPayload = z.infer<typeof homeSuggestionsPayloadSchema>;

/** Un article décidé par le staff, à son prix de vitrine, et sa raison (rien de calculé ici). */
export type HomeSuggestionView = StaffSuggestionView;
