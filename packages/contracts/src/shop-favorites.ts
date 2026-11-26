import { z } from "zod";

/**
 * Longueur maximale d'un SKU accepté en favori. La forme seulement : le
 * commerce ne lit pas le référentiel pour une préférence, et un SKU qui n'est
 * plus servi n'apparaît simplement plus dans l'onglet.
 */
export const FAVORITE_SKU_MAX_LENGTH = 64;

/** Le SKU d'un favori, tel qu'il arrive dans l'adresse `/me/favorites/:sku`. */
export const favoriteSkuSchema = z.string().trim().min(1).max(FAVORITE_SKU_MAX_LENGTH);

/**
 * **Les favoris de l'espace courant** — une société, ou l'espace personnel du
 * particulier (`documentation/commandes/boutique/les-favoris.md`).
 */
export interface MyFavoritesView {
  readonly skus: readonly string[];
}
