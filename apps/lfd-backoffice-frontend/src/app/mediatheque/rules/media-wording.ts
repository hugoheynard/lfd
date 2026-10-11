/**
 * **Les comptes dits en toutes lettres** — « 1 emploi », « 3 porteurs ».
 *
 * Un seul accord pour tout l'écran : le singulier à 1, le pluriel ailleurs —
 * zéro compris (« 0 images »). Les quatre phrases qui le recopiaient chacune
 * à sa façon sont réunies ici le 2026-10-11.
 */

/** « 1 image », « 3 images » ; le pluriel par défaut ajoute un `s`. */
export function counted(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

/** « 1 image », « 3 images » — la confirmation et le succès d'un retrait de mot. */
export function imagesLabel(count: number): string {
  return counted(count, 'image');
}

/** « Aucune image », « 1 image », « 12 images ». */
export function imagesWording(count: number): string {
  if (count === 0) {
    return 'Aucune image';
  }
  return count === 1 ? '1 image' : `${String(count)} images`;
}

/** « 1 porteur », « 4 porteurs ». */
export function carriersWording(count: number): string {
  return counted(count, 'porteur');
}

/** « 1 photo », « 12 photos » — une colonne de la frise. */
export function photosWording(count: number): string {
  return counted(count, 'photo');
}

/**
 * « Inutilisée », « 1 emploi », « 3 emplois ».
 *
 * 🔴 Zéro se dit en mot, et c'est le seul cas : on ne supprime pas une image
 * qu'un porteur affiche, et « Inutilisée » est ce qui dit qu'on peut.
 */
export function usesWording(uses: number): string {
  return uses === 0 ? 'Inutilisée' : counted(uses, 'emploi');
}

/** L'étiquette d'une tuile, ou l'aveu qu'elle manque — jamais un vide qu'on lit mal. */
export function tileLabel(image: { readonly name: string }): string {
  return image.name === '' ? 'Sans nom' : image.name;
}
