import type { FavoriteHolder } from "../value-objects/favorite-holder.js";

/** Port de **lecture** des favoris d'un espace. */
export abstract class ShopFavoritesReader {
  /** Les SKU en favori de l'espace, du plus récent au plus ancien. */
  abstract skusOf(holder: FavoriteHolder): Promise<readonly string[]>;
}
