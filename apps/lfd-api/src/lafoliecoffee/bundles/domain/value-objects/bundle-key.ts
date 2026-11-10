/** Une clé plus longue est un nom déguisé — la même borne que celle des opérations. */
export const BUNDLE_KEY_MAX_LENGTH = 64;

/** Les diacritiques qu'une décomposition NFD détache de leur lettre. */
const DIACRITICS = /\p{Diacritic}/gu;

/**
 * **La clé d'une formule ou d'un groupe**, dérivée d'un libellé :
 * « Petit déjeuner » → `petit-dejeuner`.
 *
 * Minuscules sans accent, chiffres, tirets : elle voyage dans une URL sans
 * être encodée, et c'est elle que le panier citera (lot F3). Elle est tirée
 * UNE fois, à la naissance — renommer ne la change pas, sans quoi un panier
 * en cours désignerait une formule qui n'existe plus.
 *
 * Rend la chaîne vide quand le libellé n'a ni lettre ni chiffre : c'est à
 * l'appelant de refuser, avec le nom du champ.
 */
export function keyFrom(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    // Les ligatures ne se décomposent pas : « œuf » perdrait sa première lettre.
    .replace(/œ/gu, "oe")
    .replace(/æ/gu, "ae")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug.slice(0, BUNDLE_KEY_MAX_LENGTH).replace(/-+$/u, "");
}
