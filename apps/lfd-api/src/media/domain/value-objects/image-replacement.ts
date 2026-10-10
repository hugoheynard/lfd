import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Une image remplacée par une autre** (L7 du plan
 * `documentation/mediatheque/plan-la-mediatheque-amelioree.md`, 2026-10-10) :
 * deux URL du fonds, bordées, et distinctes.
 *
 * Que les deux soient AU FONDS ne se décide pas ici — il faut le lire, et
 * c'est le handler qui le fait. Ce qui se décide sans rien lire, c'est la
 * forme : une URL vide ne désigne rien, et remplacer une image par elle-même
 * n'est pas un geste.
 */
export interface ImageReplacementPair {
  readonly from: string;
  readonly to: string;
}

/**
 * @throws {MediaReplacementUrlRequiredError} une des deux URL est vide.
 * @throws {MediaReplacedBySelfError} les deux désignent la même image.
 */
export function imageReplacement(from: string, to: string): ImageReplacementPair {
  const pair = { from: from.trim(), to: to.trim() };
  if (pair.from === "" || pair.to === "") {
    throw new MediaReplacementUrlRequiredError();
  }
  if (pair.from === pair.to) {
    throw new MediaReplacedBySelfError();
  }
  return pair;
}

/** Une des deux images n'est pas désignée (→ 400). */
export class MediaReplacementUrlRequiredError extends DomainError {
  constructor() {
    super(
      "media.replace.url_required",
      "Remplacer une image demande deux images du fonds : celle qu'on remplace et celle qui la remplace.",
    );
  }
}

/** Remplacer une image par elle-même (→ 400). */
export class MediaReplacedBySelfError extends DomainError {
  constructor() {
    super(
      "media.replace.same_image",
      "L'image choisie est déjà celle qu'on remplace : choisissez-en une autre, ou déposez la version retouchée.",
    );
  }
}
