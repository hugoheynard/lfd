import { HOME_PAGE } from "@lfd/storefront-layout";

import { isOperationKey, OPERATION_SHELF_PREFIX } from "./operation-link.js";
import { InvalidStorefrontError } from "./storefront-errors.js";

/** La longueur maximale d'une clé de famille, ou `all`. */
const SHELF_KEY_MAX = 64;

/** Le rayon « Tout ». */
export const ALL_SHELVES = "all";

/**
 * **La clé d'un rayon** : l'identifiant d'une famille du référentiel, `all`,
 * ou `op:<key>` — le rayon d'une opération datée (D8 de
 * `architecture-operations-datees.md`). Chaîne OPAQUE : la vitrine ne lit pas
 * le référentiel (CLAUDE.md §1), elle en garde l'identifiant. Un rayon disparu
 * se signale dans l'éditeur, il n'est pas refusé ici (plan, D4) — une
 * opération retirée non plus ; seule la forme de sa clé l'est.
 *
 * `home` (`HOME_PAGE`) est la page d'accueil (2026-10-10) : une clé de PAGE
 * valide partout où une page ou un objet en accepte une, mais pas un rayon —
 * une annonce ne peut pas l'ouvrir ({@link ShelfKey.linkTarget}).
 */
export class ShelfKey {
  private constructor(readonly value: string) {}

  /** @throws {InvalidStorefrontError} clé vide, entourée d'espaces, trop longue, ou `op:` mal formée. */
  static of(value: string): ShelfKey {
    if (value.startsWith(OPERATION_SHELF_PREFIX)) {
      if (!isOperationKey(value.slice(OPERATION_SHELF_PREFIX.length))) {
        throw refused(value);
      }
      return new ShelfKey(value);
    }
    if (value === "" || value !== value.trim() || value.length > SHELF_KEY_MAX) {
      throw refused(value);
    }
    return new ShelfKey(value);
  }

  /**
   * Un rayon qu'une annonce peut OUVRIR : tout ce que {@link of} accepte, sauf
   * l'accueil — la boutique n'a pas de rayon « home », le clic n'ouvrirait rien.
   *
   * @throws {InvalidStorefrontError} clé refusée par {@link of}, ou l'accueil.
   */
  static linkTarget(value: string): ShelfKey {
    if (value === HOME_PAGE) {
      throw new InvalidStorefrontError(
        "shelf_key",
        "Une annonce n'ouvre pas l'accueil : choisissez un rayon, une opération, ou aucune action.",
      );
    }
    return ShelfKey.of(value);
  }
}

function refused(value: string): InvalidStorefrontError {
  return new InvalidStorefrontError(
    "shelf_key",
    `« ${value} » n'est pas un rayon : choisissez « Tout », une famille du référentiel ou une opération.`,
  );
}
