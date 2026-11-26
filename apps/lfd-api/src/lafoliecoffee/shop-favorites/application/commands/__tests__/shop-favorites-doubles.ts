import { ShopFavoritesReader } from "../../../domain/ports/shop-favorites.reader.js";
import { ShopFavoritesWriter } from "../../../domain/ports/shop-favorites.writer.js";
import type { FavoriteHolder } from "../../../domain/value-objects/favorite-holder.js";

interface StoredFavorite {
  readonly holder: FavoriteHolder;
  readonly sku: string;
  readonly at: Date;
}

/** Les favoris en mémoire, avec la sémantique idempotente de l'adaptateur. */
export class InMemoryShopFavorites implements ShopFavoritesReader, ShopFavoritesWriter {
  readonly rows: StoredFavorite[] = [];

  skusOf(holder: FavoriteHolder): Promise<readonly string[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => sameHolder(row.holder, holder))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((row) => row.sku),
    );
  }

  add(holder: FavoriteHolder, sku: string, at: Date): Promise<void> {
    if (!this.rows.some((row) => sameHolder(row.holder, holder) && row.sku === sku)) {
      this.rows.push({ holder, sku, at });
    }
    return Promise.resolve();
  }

  remove(holder: FavoriteHolder, sku: string): Promise<void> {
    const index = this.rows.findIndex((row) => sameHolder(row.holder, holder) && row.sku === sku);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }
}

function sameHolder(a: FavoriteHolder, b: FavoriteHolder): boolean {
  return a.type === b.type && a.id === b.id;
}
