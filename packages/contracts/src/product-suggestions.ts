import { z } from "zod";

import type { CartSuggestionView } from "./cart-suggestions.js";

/**
 * ── Les suggestions de la FICHE d'un article ────────────────────────────────
 *
 * RS2, fiche (`documentation/recommandation-produit/plan-suggestions-du-staff.md`).
 * Forme seule, comme le panier (`cart-suggestions.ts`) : le déclencheur, le
 * filtre et la place sont tenus par le commerce.
 *
 * - `POST /shop/suggestions/product`      ← `ProductSuggestionsPayload` → `ProductSuggestionView[]` (sans jeton)
 * - `POST /shop/suggestions/product/mine` ← `ProductSuggestionsPayload` → `ProductSuggestionView[]` (l'espace courant décide du lecteur)
 */

const MAX_CART_SKUS = 100;
const MAX_TOKEN_LENGTH = 64;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");
const sku = z.string().min(1).max(MAX_TOKEN_LENGTH);

export const productSuggestionsPayloadSchema = z.strictObject({
  /** Le SKU de la fiche ouverte. */
  sku,
  /** Les SKU au panier — jamais suggérés. */
  skus: z.array(sku).max(MAX_CART_SKUS),
  /** Le jour visé et le point de retrait, si la boutique les connaît ; `null` sinon. */
  target: z
    .strictObject({
      date: isoDay,
      pickupAddressId: z.string().min(1).nullable(),
    })
    .nullable(),
});
export type ProductSuggestionsPayload = z.infer<typeof productSuggestionsPayloadSchema>;

/** La même vue que le panier : un article à son prix de vitrine, et sa raison. */
export type ProductSuggestionView = CartSuggestionView;
