import { z } from "zod";

import type { ShopItemView } from "./shop-catalogue.js";
import type { StaffSuggestionPhrase } from "./staff-suggestions.js";

/**
 * ── Les suggestions du PANIER ────────────────────────────────────────────────
 *
 * RS2, panier seulement (`documentation/recommandation-produit/suggestions-du-staff.md`).
 * Ce contrat ne valide que la **forme** : quelles règles s'appliquent, le
 * déclencheur, le filtre de ce qui se commande et la place bornée sont tenus
 * par le commerce (`b2b/recommendations`).
 *
 * Routes, sur le modèle du devis (`/shop/quote`) :
 *
 * - `POST /shop/suggestions/cart`      ← `CartSuggestionsPayload` → `CartSuggestionView[]` (sans jeton, lecteur particulier)
 * - `POST /shop/suggestions/cart/mine` ← `CartSuggestionsPayload` → `CartSuggestionView[]` (l'espace courant décide du lecteur)
 */

/** Même borne que le devis : un panier de boulangerie n'atteint pas cent références. */
const MAX_CART_SKUS = 100;
const MAX_TOKEN_LENGTH = 64;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

export const cartSuggestionsPayloadSchema = z.strictObject({
  /** Les SKU au panier — vide admis : « partout » vaut aussi pour un panier vide. */
  skus: z.array(z.string().min(1).max(MAX_TOKEN_LENGTH)).max(MAX_CART_SKUS),
  /** Le jour visé et le point de retrait, si la boutique les connaît ; `null` sinon. */
  target: z
    .strictObject({
      date: isoDay,
      pickupAddressId: z.string().min(1).nullable(),
    })
    .nullable(),
  /**
   * Le total du panier en centimes, tel que le client le lit au panier (HT au
   * compte, TTC sinon), s'il est connu (RS8, seuil de panier). Absent = pas
   * encore chiffré : une règle à seuil ne s'affiche pas.
   */
  cartTotalCents: z.number().int().min(0).optional(),
});
export type CartSuggestionsPayload = z.infer<typeof cartSuggestionsPayloadSchema>;

/** Pourquoi cet article est montré. Le calculé (`data`) viendra avec R1/R2. */
export interface CartSuggestionReason {
  readonly source: "staff";
  /** L'id de la règle en minuscules — l'emplacement des compteurs `staff` (`suggestions-du-staff.md` §8.1). */
  readonly ruleId: string;
  /** La phrase du staff, dans ses langues ; `null` = la boutique dit « Notre conseil ». */
  readonly phrase: StaffSuggestionPhrase | null;
}

/** Un article suggéré, à son prix de vitrine pour ce lecteur. */
export interface CartSuggestionView {
  readonly sku: string;
  readonly item: ShopItemView;
  readonly reason: CartSuggestionReason;
}
