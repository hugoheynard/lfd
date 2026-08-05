/**
 * Types de fil **communs** aux contextes du PIM. Pas de Zod ici : ce sont des
 * **vues** (formes rendues), pas des payloads validés.
 */

/** Texte traduisible — `fr` obligatoire, autres locales optionnelles (stocké jsonb). */
export interface LocalizedText {
  readonly fr: string;
  readonly en?: string;
}

/** Un mode de vente par boutique. */
export interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}

/** Matrice boutiques × modes — où et comment une gamme se vend. */
export interface SalesChannels {
  readonly b1: BoutiqueChannels;
  readonly b2: BoutiqueChannels;
}

/** Réponse standard d'une création : l'identifiant assigné par la commande (R1). */
export interface CreatedIdResponse {
  readonly id: string;
}
