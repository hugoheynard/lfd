/**
 * Le paramètre de la route d'une fiche : `boutique/article/:sku`. Seul ici et
 * pas dans `piece-address.ts` : les routes le lisent, et ne doivent pas
 * embarquer la boutique pour une chaîne.
 */
export const PIECE_SKU_PARAM = 'sku';
