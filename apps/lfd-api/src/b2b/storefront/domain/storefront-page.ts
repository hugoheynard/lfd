import { HOME_PAGE, MAX_ROWS, MIN_ROWS } from "@lfd/storefront-layout";

import { ShelfKey } from "./shelf-key.js";
import { InvalidStorefrontError } from "./storefront-errors.js";
import { StorefrontImage, type StorefrontImageState } from "./storefront-image.js";

/** Une page, en primitives validées. */
export interface StorefrontPageState {
  readonly shelfKey: string;
  readonly rows: number;
  /** L'image de la porte « Je passe la prendre » — `null` hors de l'accueil. */
  readonly pickupDoorImage: StorefrontImageState | null;
}

/** Une page telle qu'elle arrive : `pickupDoorImage` absente vaut `null`. */
export interface StorefrontPageInput {
  readonly shelfKey: string;
  readonly rows: number;
  readonly pickupDoorImage?: StorefrontImageState | null | undefined;
}

const DOOR_IMAGE_MISSING =
  "L'image de la porte « Je passe la prendre » vient de la médiathèque : choisissez-en une, ou retirez-la.";

/**
 * **La page d'un rayon** : une grille de 5 colonnes × R rangées, R choisi par
 * l'éditeur (« la limite par page »). Sous la dernière rangée, le reste du
 * rayon s'écoule en cartes.
 *
 * La page **`home`** (l'accueil, D7 du plan de la médiathèque) porte en plus
 * l'image de la porte « Je passe la prendre ». Un RÉGLAGE de la page plutôt
 * qu'un objet de la grille : la porte n'est pas dans la grille — l'accueil la
 * pose à côté de celle de la livraison —, et un objet demanderait une
 * position, une emprise et une règle « une seule porte » pour rien. Elle
 * reste un objet de la vitrine au sens de D7 : composée dans le même éditeur,
 * enregistrée et tracée avec elle, comptée comme porteur de son image.
 */
export class StorefrontPage {
  private constructor(readonly state: StorefrontPageState) {}

  /** @throws {InvalidStorefrontError} rayon mal formé, rangées hors bornes, porte hors de l'accueil. */
  static of(input: StorefrontPageInput): StorefrontPage {
    const shelfKey = ShelfKey.of(input.shelfKey).value;
    if (!Number.isInteger(input.rows) || input.rows < MIN_ROWS || input.rows > MAX_ROWS) {
      throw new InvalidStorefrontError(
        "page",
        `La page du rayon « ${shelfKey} » compte de ${String(MIN_ROWS)} à ${String(MAX_ROWS)} rangées.`,
      );
    }
    const door = input.pickupDoorImage ?? null;
    if (door !== null && shelfKey !== HOME_PAGE) {
      throw new InvalidStorefrontError(
        "page",
        `Le rayon « ${shelfKey} » n'a pas de porte « Je passe la prendre » : son image se règle sur la page d'accueil.`,
      );
    }
    return new StorefrontPage({
      shelfKey,
      rows: input.rows,
      pickupDoorImage: door === null ? null : StorefrontImage.of(door, DOOR_IMAGE_MISSING).state,
    });
  }

  get shelfKey(): string {
    return this.state.shelfKey;
  }

  get rows(): number {
    return this.state.rows;
  }

  /** La même page, sa porte `from` devenue `to` — ou `this` si elle ne la montrait pas. */
  withImageRepointed(from: string, to: string): StorefrontPage {
    const door = this.state.pickupDoorImage;
    return door === null || door.url !== from
      ? this
      : new StorefrontPage({ ...this.state, pickupDoorImage: { ...door, url: to } });
  }

  /** Est-elle, en tout point, la même que `other` ? Comparaison de valeur. */
  sameAs(other: StorefrontPage): boolean {
    return JSON.stringify(this.state) === JSON.stringify(other.state);
  }
}
