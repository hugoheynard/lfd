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
 * Où et comment une gamme se vend.
 *
 * Les emplacements sont une **donnée** : la carte est indexée par identifiant
 * d'emplacement, jamais par des clés fixes. Ouvrir un point de vente est une
 * ligne de plus dans le référentiel, pas une migration.
 *
 * Le B2B reste un booléen à part : la plateforme n'est pas un emplacement, et
 * un professionnel qui commande en gros ne consomme ni sur place ni à emporter.
 */
export interface SalesChannels {
  readonly boutiques: Readonly<Record<string, BoutiqueChannels>>;
  readonly b2b: boolean;
}

/** Réponse standard d'une création : l'identifiant assigné par la commande (R1). */
export interface CreatedIdResponse {
  readonly id: string;
}
