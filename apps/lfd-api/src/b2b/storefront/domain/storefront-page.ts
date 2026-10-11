import { HOME_PAGE, MAX_ROWS, MIN_ROWS } from "@lfd/storefront-layout";

import { sameUnitPoint } from "../../../platform/shared/geometry/unit-point.js";

import { ShelfKey } from "./shelf-key.js";
import { InvalidStorefrontError } from "./storefront-errors.js";
import {
  StorefrontImage,
  type StorefrontFocal,
  type StorefrontImageInput,
  type StorefrontImageState,
} from "./storefront-image.js";

/** Une page, en primitives validées. */
export interface StorefrontPageState {
  readonly shelfKey: string;
  readonly rows: number;
  /** L'image de la porte « Je passe la prendre » — `null` hors de l'accueil. */
  readonly pickupDoorImage: StorefrontImageState | null;
  /**
   * L'image de la porte livraison — `null` hors de l'accueil, ou quand la
   * carte livraison reprend celle de la porte retrait.
   */
  readonly deliveryDoorImage: StorefrontImageState | null;
}

/** Une page telle qu'elle arrive : une image de porte absente vaut `null`. */
export interface StorefrontPageInput {
  readonly shelfKey: string;
  readonly rows: number;
  readonly pickupDoorImage?: StorefrontImageInput | null | undefined;
  readonly deliveryDoorImage?: StorefrontImageInput | null | undefined;
}

const PICKUP_DOOR = "porte « Je passe la prendre »";
const DELIVERY_DOOR = "porte livraison";

/** Une image de porte, validée — et refusée hors de l'accueil. */
function doorImageOf(
  shelfKey: string,
  door: StorefrontImageInput | null,
  doorName: string,
): StorefrontImageState | null {
  if (door === null) return null;
  if (shelfKey !== HOME_PAGE) {
    throw new InvalidStorefrontError(
      "page",
      `Le rayon « ${shelfKey} » n'a pas de ${doorName} : son image se règle sur la page d'accueil.`,
    );
  }
  return StorefrontImage.of(
    door,
    `L'image de la ${doorName} vient de la médiathèque : choisissez-en une, ou retirez-la.`,
  ).state;
}

/** L'image `door`, repointée de `from` vers `to` — ou la même si elle ne la montrait pas. */
function repointed(
  door: StorefrontImageState | null,
  from: string,
  to: string,
): StorefrontImageState | null {
  return door === null || door.url !== from ? door : { ...door, url: to };
}

/** L'image `door`, recadrée sur `focal` si elle montre `url` — ou la même sinon. */
function refocused(
  door: StorefrontImageState | null,
  url: string,
  focal: StorefrontFocal | null,
): StorefrontImageState | null {
  return door === null || door.url !== url || sameUnitPoint(door.focal, focal)
    ? door
    : { ...door, focal };
}

/**
 * **La page d'un rayon** : une grille de 5 colonnes × R rangées, R choisi par
 * l'éditeur (« la limite par page »). Sous la dernière rangée, le reste du
 * rayon s'écoule en cartes.
 *
 * La page **`home`** (l'accueil, `documentation/mediatheque/mediatheque.md` §7 bis) porte en plus
 * l'image de la porte « Je passe la prendre » et celle de la porte livraison
 * (vide : la boutique reprend l'image retrait). Un RÉGLAGE de la page plutôt
 * qu'un objet de la grille : la porte n'est pas dans la grille — l'accueil la
 * pose à côté de celle de la livraison —, et un objet demanderait une
 * position, une emprise et une règle « une seule porte » pour rien. Elle
 * reste un objet de la vitrine au sens de D7 : composée dans le même éditeur,
 * enregistrée et tracée avec elle, comptée comme porteur de son image.
 */
export class StorefrontPage {
  private constructor(readonly state: StorefrontPageState) {}

  /** @throws {InvalidStorefrontError} rayon mal formé, rangées hors bornes, porte hors de l'accueil, image de porte sans url. */
  static of(input: StorefrontPageInput): StorefrontPage {
    const shelfKey = ShelfKey.of(input.shelfKey).value;
    if (!Number.isInteger(input.rows) || input.rows < MIN_ROWS || input.rows > MAX_ROWS) {
      throw new InvalidStorefrontError(
        "page",
        `La page du rayon « ${shelfKey} » compte de ${String(MIN_ROWS)} à ${String(MAX_ROWS)} rangées.`,
      );
    }
    return new StorefrontPage({
      shelfKey,
      rows: input.rows,
      pickupDoorImage: doorImageOf(shelfKey, input.pickupDoorImage ?? null, PICKUP_DOOR),
      deliveryDoorImage: doorImageOf(shelfKey, input.deliveryDoorImage ?? null, DELIVERY_DOOR),
    });
  }

  get shelfKey(): string {
    return this.state.shelfKey;
  }

  get rows(): number {
    return this.state.rows;
  }

  /** La même page, ses portes qui montraient `from` montrant `to` — ou `this` si aucune ne la montrait. */
  withImageRepointed(from: string, to: string): StorefrontPage {
    return this.withDoors(
      repointed(this.state.pickupDoorImage, from, to),
      repointed(this.state.deliveryDoorImage, from, to),
    );
  }

  /**
   * La même page, ses portes qui montrent `url` recadrées sur `focal` — ou
   * `this` si aucune ne la montre, ou déjà sur ce point (§7 bis de la médiathèque).
   */
  withImageRefocused(url: string, focal: StorefrontFocal | null): StorefrontPage {
    return this.withDoors(
      refocused(this.state.pickupDoorImage, url, focal),
      refocused(this.state.deliveryDoorImage, url, focal),
    );
  }

  /** `this` si les deux portes n'ont pas bougé (identité), sinon la page neuve. */
  private withDoors(
    pickupDoorImage: StorefrontImageState | null,
    deliveryDoorImage: StorefrontImageState | null,
  ): StorefrontPage {
    return pickupDoorImage === this.state.pickupDoorImage &&
      deliveryDoorImage === this.state.deliveryDoorImage
      ? this
      : new StorefrontPage({ ...this.state, pickupDoorImage, deliveryDoorImage });
  }

  /** Est-elle, en tout point, la même que `other` ? Comparaison de valeur. */
  sameAs(other: StorefrontPage): boolean {
    return JSON.stringify(this.state) === JSON.stringify(other.state);
  }
}
