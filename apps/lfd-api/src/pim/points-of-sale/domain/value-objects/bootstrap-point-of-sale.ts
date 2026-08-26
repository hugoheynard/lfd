import { ROOT_CONTEXT_KEY } from "../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";

/** L'identifiant du point de vente **racine** — la plateforme professionnelle. */
export const ROOT_POINT_OF_SALE_ID = "pos_b2b";

/**
 * La plateforme professionnelle, telle qu'elle est semée si elle manque.
 *
 * ## Pourquoi une racine, ici aussi
 *
 * Même contrat, et même raison, que le contexte racine
 * (`bootstrap-contexts.ts`) : sans cette ligne, la matrice B2B n'a plus de
 * cible et la boutique professionnelle **se vide sans qu'une erreur soit
 * levée**. Une panne silencieuse mérite une garde au boot.
 *
 * - **semée au boot** si elle manque — elle réapparaît même supprimée en base ;
 * - **ineffaçable**, et son offre avec elle : c'est le contexte racine qu'elle
 *   offre, et rien d'autre ;
 * - `baseUrl: null`, tenu par `point_of_sale_shop_has_base_url` : une
 *   plateforme n'a pas d'URL de click & collect.
 *
 * ## Pourquoi « Plateforme pro » et pas « B2B »
 *
 * Le CONTEXTE de vente s'appelait « B2B » lui aussi, et les deux ne disent pas
 * la même chose : l'un est **d'où** l'on vend, l'autre **comment**. Deux lignes
 * portant le même nom sur deux écrans voisins, c'est la moitié du flou. La clé
 * `pos_b2b` ne bouge pas — c'est une identité.
 */
export function bootstrapRootPointOfSale() {
  return {
    id: ROOT_POINT_OF_SALE_ID,
    kind: "platform",
    label: "Plateforme pro",
    baseUrl: null,
    contextKey: ROOT_CONTEXT_KEY,
  } as const;
}

/** Ce point de vente est-il la racine ? Un seul endroit sait le reconnaître. */
export function isRootPointOfSale(id: string): boolean {
  return id === ROOT_POINT_OF_SALE_ID;
}
