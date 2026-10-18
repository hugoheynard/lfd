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

/** Pourquoi un article DÉCIDÉ par le staff est montré. */
export interface StaffSuggestionReason {
  readonly source: "staff";
  /** L'id de la règle en minuscules — l'emplacement des compteurs `staff` (`suggestions-du-staff.md` §8.1). */
  readonly ruleId: string;
  /** La phrase du staff, dans ses langues ; `null` = la boutique dit son titre par défaut. */
  readonly phrase: StaffSuggestionPhrase | null;
}

/**
 * Pourquoi un article CALCULÉ est montré (R2, « souvent pris avec ») : au
 * moins cinq clients distincts l'ont commandé dans la même commande qu'un
 * article de ce panier. La boutique met la phrase (« Souvent pris avec … »).
 *
 * 🔴 Aucun nombre de clients ni part : un compte exact, près du seuil,
 * dirait combien de personnes ont fait ce panier. `kind` est aussi
 * l'emplacement des compteurs `data`.
 */
export interface BoughtWithSuggestionReason {
  readonly source: "data";
  readonly kind: "bought_with";
  /** L'article du panier avec lequel il est souvent pris. */
  readonly withSku: string;
  /** Son nom tel que la vitrine le sert à ce lecteur — ce que la phrase cite. */
  readonly withName: string;
}

/** Pourquoi cet article est montré au panier : le décidé, ou le calculé. */
export type CartSuggestionReason = StaffSuggestionReason | BoughtWithSuggestionReason;

/** Un article suggéré, à son prix de vitrine pour ce lecteur. */
export interface CartSuggestionView {
  readonly sku: string;
  readonly item: ShopItemView;
  readonly reason: CartSuggestionReason;
}

/**
 * Un article DÉCIDÉ par le staff — ce que servent la fiche et l'accueil, où
 * rien n'est encore calculé. Assignable à `CartSuggestionView` : une même
 * carte les montre tous.
 */
export interface StaffSuggestionView {
  readonly sku: string;
  readonly item: ShopItemView;
  readonly reason: StaffSuggestionReason;
}
