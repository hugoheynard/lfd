import type { Weekday } from "./address.js";
import type { CartSuggestionReason } from "./cart-suggestions.js";
import { homeSuggestionsPayloadSchema, type HomeSuggestionsPayload } from "./home-suggestions.js";
import type { ShopItemView } from "./shop-catalogue.js";

/**
 * ── « VOS HABITUELS » — l'accueil d'un PRO ─────────────────────────────────
 *
 * R1 (`documentation/recommandation-produit/suggestions-calculees.md`, §8) :
 * les articles que la société du lecteur commande régulièrement. Forme seule :
 * le seuil, le rythme, le filtre et la place sont tenus par le commerce.
 *
 * - `POST /shop/suggestions/usuals/mine` ← `UsualSuggestionsPayload` → `UsualSuggestionView[]`
 *
 * 🔴 Aucune route publique : un particulier ou un invité n'a pas d'habituels
 * tant que le cabinet n'a pas tranché (lot R3, `historique-du-particulier.md`).
 * Sans société dans l'espace courant, la route rend une liste vide.
 */

/** Même forme que l'accueil : le panier n'y sert qu'à exclure, le jour visé à l'heure limite. */
export const usualSuggestionsPayloadSchema = homeSuggestionsPayloadSchema;
export type UsualSuggestionsPayload = HomeSuggestionsPayload;

/**
 * La société le commande surtout ce jour de la semaine — au moins trois
 * commandes ce jour-là, et plus que tout autre jour. Le jour est celui pour
 * lequel la commande est passée (retrait ou livraison), sinon celui de sa
 * passation. La boutique dit « Tous les mardis ».
 */
export interface WeeklyRhythmSuggestionReason {
  readonly source: "data";
  readonly kind: "weekly_rhythm";
  readonly weekday: Weekday;
}

/**
 * La société le commande souvent, sans jour qui domine. `orderCount` est le
 * nombre de SES commandes qui le portent sur la fenêtre — un fait qu'elle
 * voit déjà dans « Mes commandes ». La boutique dit « Commandé 6 fois ».
 */
export interface FrequentSuggestionReason {
  readonly source: "data";
  readonly kind: "frequent";
  readonly orderCount: number;
}

/** Pourquoi un article est parmi « vos habituels ». `kind` est aussi l'emplacement des compteurs `data`. */
export type UsualSuggestionReason = WeeklyRhythmSuggestionReason | FrequentSuggestionReason;

/** Un habituel, au prix de la vitrine pour la société du lecteur. */
export interface UsualSuggestionView {
  readonly sku: string;
  readonly item: ShopItemView;
  readonly reason: UsualSuggestionReason;
}

/** Toute raison qu'une carte de suggestion sait mettre en phrase. */
export type SuggestionReason = CartSuggestionReason | UsualSuggestionReason;

/** Toute suggestion qu'une même carte montre : le panier, la fiche, l'accueil, les habituels. */
export interface SuggestionView {
  readonly sku: string;
  readonly item: ShopItemView;
  readonly reason: SuggestionReason;
}
