import type { StaffSuggestionReader } from "@lfd/contracts";

/** L'emplacement prévisualisé : le panier, la fiche d'un article, ou l'accueil. */
export type PreviewPlace =
  | { readonly placement: "cart" }
  | { readonly placement: "product"; readonly viewedSku: string }
  | { readonly placement: "home" };

/**
 * **L'aperçu des suggestions décidées** (RS5) : ce que la boutique afficherait
 * à cet emplacement, pour cette clientèle, ce jour-là — et pourquoi chaque
 * règle s'affiche ou non.
 */
export class PreviewStaffSuggestionsQuery {
  constructor(
    readonly place: PreviewPlace,
    /** Les SKU au panier. */
    readonly skus: readonly string[],
    readonly audience: StaffSuggestionReader,
    /** `AAAA-MM-JJ` ; `null` = le jour métier d'aujourd'hui. */
    readonly day: string | null,
    readonly pickupAddressId: string | null,
    /** `HH:MM` ; `null` = l'heure de maintenant (RS8, créneau). */
    readonly time: string | null = null,
    /** Le total du panier en centimes ; `null` = pas encore chiffré (RS8, seuil). */
    readonly cartTotalCents: number | null = null,
  ) {}
}
