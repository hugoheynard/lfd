/**
 * Le nom d'un gabarit — sa clé d'unicité.
 *
 * « Deux gabarits ne portent pas le même nom » (`boutique-rayon-layout.md`,
 * « Les gabarits »), et « Noël » et « noel » se confondraient à l'œil : la clé
 * ignore donc la casse, les accents et les espaces autour. Le serveur la range
 * dans une colonne UNIQUE (`storefront_template.name_key`) ; l'éditeur peut la
 * comparer avant d'envoyer, avec la même définition.
 */

export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_DESCRIPTION_MAX = 280;

/** Les diacritiques combinants que la décomposition NFD détache de leur lettre. */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/** La clé d'unicité d'un nom : sans espaces autour, sans accents, en minuscules. */
export function templateNameKey(name: string): string {
  return name.trim().normalize("NFD").replace(COMBINING_MARKS, "").toLocaleLowerCase("fr");
}
