import { InvalidStorefrontError } from "./storefront-errors.js";

/** La longueur maximale d'une clé de rayon — un identifiant de famille, ou `all`. */
const SHELF_KEY_MAX = 64;

/** Le rayon « Tout ». */
export const ALL_SHELVES = "all";

/**
 * **La clé d'un rayon** : l'identifiant d'une famille du référentiel, ou
 * `all`. Chaîne OPAQUE : la vitrine ne lit pas le référentiel (CLAUDE.md §1),
 * elle en garde l'identifiant. Un rayon disparu se signale dans l'éditeur, il
 * n'est pas refusé ici (plan, D4).
 */
export class ShelfKey {
  private constructor(readonly value: string) {}

  /** @throws {InvalidStorefrontError} clé vide, entourée d'espaces, ou trop longue. */
  static of(value: string): ShelfKey {
    if (value === "" || value !== value.trim() || value.length > SHELF_KEY_MAX) {
      throw new InvalidStorefrontError(
        "shelf_key",
        `« ${value} » n'est pas un rayon : choisissez « Tout » ou une famille du référentiel.`,
      );
    }
    return new ShelfKey(value);
  }
}
