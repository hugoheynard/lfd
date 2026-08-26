import type { SalesContext } from "./sales-context.js";

/**
 * La clé du contexte **racine** — celui sans lequel la plateforme
 * professionnelle cesse de fonctionner.
 *
 * Français en valeur, et c'est assumé : `key` est une DONNÉE en base, pas un
 * identifiant de code. Sa traduction (`b2b` n'en a pas besoin, `emporter` et
 * `surPlace` si) part avec la tranche d-3, en un `UPDATE` cascadé — cf.
 * `documentation/pim/c0d-matrice-de-canaux.md` § 7.
 */
export const ROOT_CONTEXT_KEY = "b2b";

/**
 * Le contexte racine, tel qu'il est semé s'il manque.
 *
 * ## Pourquoi une racine
 *
 * Un contexte de vente est une donnée ; il faut donc se demander ce que coûte
 * sa disparition. Pour celui-ci, la réponse est la même que pour l'admin
 * racine : **rien ne casse bruyamment**. Aucune TVA professionnelle ne se
 * règle, la projection ne retient plus aucun article, et la boutique B2B se
 * vide sans qu'une seule erreur soit levée.
 *
 * Il suit donc le contrat éprouvé de `bootstrapAdmin` (`src/staff/directory/`) :
 *
 * - **semé au boot** s'il manque — il réapparaît même supprimé directement en
 *   base ;
 * - **ineffaçable** et **non renommable** : c'est la `key` qui l'identifie,
 *   donc la renommer serait le chemin en deux temps vers sa suppression. La
 *   leçon vient de l'admin racine, où elle a déjà coûté ;
 * - **désactivable**, en revanche. `active = false` suspend la facturation sans
 *   détruire la définition — fermer un canal n'est pas effacer son existence.

 */
export function bootstrapRootContext(): Omit<SalesContext, "id"> {
  return {
    key: ROOT_CONTEXT_KEY,
    label: "B2B",
    // VIDE, et pas « -b2b » : `handleSuffix` est du vocabulaire Shopify — le
    // suffixe d'URL d'un produit — et le B2B n'y est pas projeté. La plateforme
    // professionnelle a son propre projecteur, qui ne fabrique aucun handle.
    //
    // ⚠️ Si le B2B devenait un jour une boutique Shopify, il lui faudrait un
    // suffixe NON VIDE : le vide est celui du contexte par défaut (le handle nu
    // qui protège les URL indexées), et deux contextes projetés avec le même
    // suffixe produiraient le même handle.
    handleSuffix: "",
    active: true,
    shopifyProjected: false,
    position: 3,
  };
}

/** Ce contexte est-il la racine ? Un seul endroit sait comment on le reconnaît. */
export function isRootContext(key: string): boolean {
  return key === ROOT_CONTEXT_KEY;
}
