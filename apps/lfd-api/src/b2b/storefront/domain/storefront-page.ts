import { MAX_ROWS, MIN_ROWS } from "@lfd/storefront-layout";

import { ShelfKey } from "./shelf-key.js";
import { InvalidStorefrontError } from "./storefront-errors.js";

/** Une page, en primitives validées. */
export interface StorefrontPageState {
  readonly shelfKey: string;
  readonly rows: number;
}

/**
 * **La page d'un rayon** : une grille de 5 colonnes × R rangées, R choisi par
 * l'éditeur (« la limite par page »). Sous la dernière rangée, le reste du
 * rayon s'écoule en cartes.
 */
export class StorefrontPage {
  private constructor(readonly state: StorefrontPageState) {}

  /** @throws {InvalidStorefrontError} rayon mal formé, rangées hors bornes. */
  static of(input: StorefrontPageState): StorefrontPage {
    const shelfKey = ShelfKey.of(input.shelfKey).value;
    if (!Number.isInteger(input.rows) || input.rows < MIN_ROWS || input.rows > MAX_ROWS) {
      throw new InvalidStorefrontError(
        "page",
        `La page du rayon « ${shelfKey} » compte de ${String(MIN_ROWS)} à ${String(MAX_ROWS)} rangées.`,
      );
    }
    return new StorefrontPage({ shelfKey, rows: input.rows });
  }

  get shelfKey(): string {
    return this.state.shelfKey;
  }

  get rows(): number {
    return this.state.rows;
  }
}
