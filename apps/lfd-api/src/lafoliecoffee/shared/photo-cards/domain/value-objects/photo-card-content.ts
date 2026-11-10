import type { AppError } from "../../../../../platform/shared/errors/app-error.js";
import type { PhotoCardText } from "../entities/photo-card-list.js";

/** Les refus du contenu, dans les mots de l'usage. */
export interface PhotoCardContentRefusals {
  readonly emptyTitle: () => AppError;
  readonly titleTooLong: (length: number, max: number) => AppError;
  readonly bodyTooLong: (length: number, max: number) => AppError;
}

/** Les longueurs de l'usage — 80 / 1000 pour une étape, 80 / 2000 pour une note. */
export interface PhotoCardContentRules {
  readonly titleMax: number;
  readonly bodyMax: number;
  readonly refusals: PhotoCardContentRefusals;
}

/**
 * Nettoie (espaces de bord) et valide le titre et le texte d'une carte.
 *
 * Une fonction et non une classe : chaque usage garde SON value object
 * (`DeliveryStepContent`…), dont le nom dit ce qu'il est, et lui délègue la
 * règle. Le titre est obligatoire, le texte facultatif.
 *
 * @throws une des fabriques de `rules.refusals`.
 */
export function readPhotoCardContent(
  input: PhotoCardText,
  rules: PhotoCardContentRules,
): PhotoCardText {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title === "") {
    throw rules.refusals.emptyTitle();
  }
  if (title.length > rules.titleMax) {
    throw rules.refusals.titleTooLong(title.length, rules.titleMax);
  }
  if (body.length > rules.bodyMax) {
    throw rules.refusals.bodyTooLong(body.length, rules.bodyMax);
  }
  return { title, body };
}
