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

/**
 * Où et comment une gamme se vend : les boutiques déclinées par mode, plus la
 * plateforme B2B.
 *
 * Le B2B est un **booléen**, pas une paire : un professionnel qui commande en
 * gros ne consomme ni sur place ni à emporter, et lui donner la forme d'une
 * boutique inventerait un choix qui n'existe pas.
 */
export interface SalesChannels {
  readonly b1: BoutiqueChannels;
  readonly b2: BoutiqueChannels;
  readonly b2b: boolean;
}

/** Réponse standard d'une création : l'identifiant assigné par la commande (R1). */
export interface CreatedIdResponse {
  readonly id: string;
}
