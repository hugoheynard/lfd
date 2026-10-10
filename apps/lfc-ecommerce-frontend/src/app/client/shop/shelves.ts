/**
 * « Tout » n'est PAS un rayon : c'est l'absence de filtre.
 *
 * Il ouvre la liste parce qu'on arrive dessus, mais il ne porte ni taux, ni
 * produit, ni rien que le référentiel connaisse. C'est une convention de
 * VITRINE, et c'est pourquoi elle vit ici et pas dans le catalogue : le serveur
 * ne rendra jamais un rayon « all ».
 */
export const ALL_SHELVES = 'all';

/**
 * Le paramètre d'adresse qui ouvre un rayon : `/boutique?rayon=op:noel`. Ici
 * et pas dans `shelf-address.ts` : l'accueil le lit, et ne doit pas embarquer
 * le routeur de la boutique pour une chaîne.
 */
export const SHELF_PARAM = 'rayon';
