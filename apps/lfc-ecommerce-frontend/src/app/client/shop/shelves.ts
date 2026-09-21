/**
 * « Tout » n'est PAS un rayon : c'est l'absence de filtre.
 *
 * Il ouvre la liste parce qu'on arrive dessus, mais il ne porte ni taux, ni
 * produit, ni rien que le référentiel connaisse. C'est une convention de
 * VITRINE, et c'est pourquoi elle vit ici et pas dans le catalogue : le serveur
 * ne rendra jamais un rayon « all ».
 */
export const ALL_SHELVES = 'all';
