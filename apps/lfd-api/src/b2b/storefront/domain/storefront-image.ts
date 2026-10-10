import { InvalidStorefrontError } from "./storefront-errors.js";
import {
  STOREFRONT_TEXT_FIELDS,
  StorefrontText,
  type StorefrontTextState,
} from "./storefront-text.js";

const IMAGE_URL_MAX = 2048;

/** Une image de vitrine, en primitives validées : l'URL de la médiathèque, et son texte alternatif. */
export interface StorefrontImageState {
  readonly url: string;
  readonly alt: StorefrontTextState | null;
}

/**
 * **Une image de la vitrine** — celle d'une annonce, ou celle de la porte
 * « Je passe la prendre » de l'accueil.
 *
 * Seule sa forme est refusée : une URL vide ou démesurée. Que l'image soit
 * bien au fonds n'est pas vérifiable ici — la vitrine ne lit pas la
 * médiathèque (`b2b → media` est hors de la matrice) ; c'est le canal des
 * porteurs qui, en retour, l'empêche d'en disparaître.
 */
export class StorefrontImage {
  private constructor(readonly state: StorefrontImageState) {}

  /**
   * @param refusal la phrase dite quand l'URL manque — elle nomme l'endroit
   *   (« L'image d'une info… », « L'image de la porte… »).
   * @throws {InvalidStorefrontError} URL vide ou trop longue, texte alternatif refusé.
   */
  static of(input: StorefrontImageState, refusal: string): StorefrontImage {
    const url = input.url.trim();
    if (url === "" || url.length > IMAGE_URL_MAX) {
      throw new InvalidStorefrontError("image", refusal);
    }
    const alt =
      input.alt === null
        ? null
        : StorefrontText.of(input.alt, STOREFRONT_TEXT_FIELDS.imageAlt).toPersistence();
    return new StorefrontImage({ url, alt });
  }
}
