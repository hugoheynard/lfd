import { describeFormat, type PlacedBlock } from "@lfd/storefront-layout";

import {
  type ObjectSettingsInput,
  ObjectSettings,
  type ObjectSettingsState,
} from "./object-settings.js";
import { ShelfKey } from "./shelf-key.js";
import { StorefrontContent, type StorefrontContentState } from "./storefront-content.js";
import { InvalidStorefrontError } from "./storefront-errors.js";

/** Un objet, en primitives validées. */
export interface StorefrontObjectState {
  readonly id: string;
  readonly settings: ObjectSettingsState;
  readonly column: number;
  readonly row: number;
  readonly shelves: readonly string[];
  /** Dans l'ordre de défilement. */
  readonly contents: readonly StorefrontContentState[];
}

/** Un objet tel qu'il arrive — identifié (chargé, ou nommé par le serveur). */
export interface StorefrontObjectInput {
  readonly id: string;
  readonly settings: ObjectSettingsInput;
  readonly column: number;
  readonly row: number;
  readonly shelves: readonly string[];
  readonly contents: readonly StorefrontContentState[];
}

/**
 * **Un objet posé** : une forme à une position, sur un ou plusieurs rayons, à
 * la MÊME place sur chacun.
 *
 * Il refuse ce qui ne dépend que de lui : aucun rayon, plusieurs contenus sur
 * un objet qui n'en montre qu'un. Le chevauchement et le débordement dépendent
 * des autres objets et des pages : c'est la vitrine qui les juge.
 *
 * Un objet peut exister VIDE, le temps de la composition
 * (`boutique-rayon-layout.md`, « Le mapping vient après »).
 */
export class StorefrontObject {
  private constructor(readonly state: StorefrontObjectState) {}

  /** @throws {InvalidStorefrontError} réglage, rayon ou contenu refusé. */
  static of(input: StorefrontObjectInput): StorefrontObject {
    const settings = ObjectSettings.of(input.settings).state;
    const where = `« ${describeFormat(settings.shape)} » posé en colonne ${String(input.column)}, rangée ${String(input.row)}`;
    const shelves = [...new Set(input.shelves.map((shelf) => ShelfKey.of(shelf).value))];
    if (shelves.length === 0) {
      throw new InvalidStorefrontError(
        "placement",
        `L'objet ${where} ne paraît sur aucun rayon : choisissez-en au moins un.`,
      );
    }
    if (!settings.multiple && input.contents.length > 1) {
      throw new InvalidStorefrontError(
        "contents",
        `L'objet ${where} ne montre qu'un contenu : passez-le à « plusieurs », ou retirez-en.`,
      );
    }
    return new StorefrontObject({
      id: input.id,
      settings,
      column: input.column,
      row: input.row,
      shelves,
      contents: input.contents.map((content) => StorefrontContent.of(content).state),
    });
  }

  get id(): string {
    return this.state.id;
  }

  /** La forme de la grille, telle que `@lfd/storefront-layout` la juge. */
  toPlacedBlock(): PlacedBlock {
    return {
      id: this.state.id,
      format: this.state.settings.shape,
      column: this.state.column,
      row: this.state.row,
      shelves: this.state.shelves,
    };
  }

  /** A-t-il changé de place (colonne ou rangée) par rapport à `before` ? */
  movedFrom(before: StorefrontObject): boolean {
    return before.state.column !== this.state.column || before.state.row !== this.state.row;
  }

  /** Est-il, en tout point, le même que `other` ? Comparaison de valeur. */
  sameAs(other: StorefrontObject): boolean {
    return JSON.stringify(this.state) === JSON.stringify(other.state);
  }
}
