import type { FavoriteHolder } from "../value-objects/favorite-holder.js";

/**
 * Port d'**écriture** des favoris. Une préférence sans règle qui puisse la
 * refuser : un CRUD honnête (CLAUDE.md §3.1), et les deux gestes sont
 * idempotents par construction.
 */
export abstract class ShopFavoritesWriter {
  /** Pose le favori ; déjà posé, rien ne change (ni `created_at`). */
  abstract add(holder: FavoriteHolder, sku: string, at: Date): Promise<void>;

  /** Retire le favori ; absent, rien ne change. */
  abstract remove(holder: FavoriteHolder, sku: string): Promise<void>;
}
