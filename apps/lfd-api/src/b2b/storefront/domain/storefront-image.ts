import { InvalidStorefrontError } from "./storefront-errors.js";
import {
  STOREFRONT_TEXT_FIELDS,
  StorefrontText,
  type StorefrontTextState,
} from "./storefront-text.js";

const IMAGE_URL_MAX = 2048;

/** Un point focal : deux fractions de 0 à 1, depuis le coin haut gauche. */
export interface StorefrontFocal {
  readonly x: number;
  readonly y: number;
}

/**
 * Une image de vitrine, en primitives validées : l'URL de la médiathèque, son
 * texte alternatif, et son point focal — `null` quand personne ne s'est
 * prononcé, et la boutique recadre alors au centre.
 */
export interface StorefrontImageState {
  readonly url: string;
  readonly alt: StorefrontTextState | null;
  readonly focal: StorefrontFocal | null;
}

/**
 * Une image telle qu'elle arrive. `focal` absent vaut `null` : un éditeur
 * d'avant L10 (plan de la médiathèque, 2026-10-11) reste valide, et son image
 * se recadre au centre comme avant.
 */
export interface StorefrontImageInput {
  readonly url: string;
  readonly alt: StorefrontTextState | null;
  readonly focal?: StorefrontFocal | null | undefined;
}

const FOCAL_OUT_OF_FRAME =
  "Le point focal d'une image se pose dans l'image (deux fractions de 0 à 1) : " +
  "replacez-le à la médiathèque, puis choisissez l'image à nouveau.";

/**
 * **Une image de la vitrine** — celle d'une annonce, ou celle de la porte
 * « Je passe la prendre » de l'accueil.
 *
 * Seule sa forme est refusée : une URL vide ou démesurée, un point focal hors
 * de l'image. Que l'image soit bien au fonds n'est pas vérifiable ici — la
 * vitrine ne lit pas la médiathèque (`b2b → media` est hors de la matrice) ;
 * c'est le canal des porteurs qui, en retour, l'empêche d'en disparaître.
 *
 * Le point focal est une COPIE de celui de la médiathèque (L10 du plan) :
 * l'éditeur l'envoie au choix de l'image, et la médiathèque le fait suivre
 * quand elle redécrit l'image ({@link Storefront.refocus}).
 */
export class StorefrontImage {
  private constructor(readonly state: StorefrontImageState) {}

  /**
   * @param refusal la phrase dite quand l'URL manque — elle nomme l'endroit
   *   (« L'image d'une info… », « L'image de la porte… »).
   * @throws {InvalidStorefrontError} URL vide ou trop longue, texte alternatif
   *   refusé, point focal hors de l'image.
   */
  static of(input: StorefrontImageInput, refusal: string): StorefrontImage {
    const url = input.url.trim();
    if (url === "" || url.length > IMAGE_URL_MAX) {
      throw new InvalidStorefrontError("image", refusal);
    }
    const alt =
      input.alt === null
        ? null
        : StorefrontText.of(input.alt, STOREFRONT_TEXT_FIELDS.imageAlt).toPersistence();
    return new StorefrontImage({ url, alt, focal: storefrontFocal(input.focal ?? null) });
  }
}

/**
 * Le point focal validé, ou `null`.
 *
 * @throws {InvalidStorefrontError} une coordonnée hors de 0..1, ou pas un nombre.
 */
export function storefrontFocal(focal: StorefrontFocal | null): StorefrontFocal | null {
  if (focal === null) {
    return null;
  }
  if (!isFraction(focal.x) || !isFraction(focal.y)) {
    throw new InvalidStorefrontError("focal", FOCAL_OUT_OF_FRAME);
  }
  return { x: focal.x, y: focal.y };
}

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Les deux points focaux disent-ils la même chose ? `null` = centre, distinct de `{0.5, 0.5}`. */
export function sameFocal(left: StorefrontFocal | null, right: StorefrontFocal | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.x === right.x && left.y === right.y;
}
