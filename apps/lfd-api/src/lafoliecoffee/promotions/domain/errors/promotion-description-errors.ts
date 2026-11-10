import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de la description interne d'une promotion**
 * (`documentation/promotions/promotions.md`, § 2.1). Rangés à part :
 * `promotion-errors.ts` dépasse déjà la taille d'un fichier.
 */

/** Une description interne plus longue que la borne. */
export class PromotionDescriptionTooLongError extends DomainError {
  constructor(
    readonly length: number,
    readonly max: number,
  ) {
    super(
      "promotions.description_too_long",
      `La description de la promotion fait ${String(length)} caractères, au-delà des ${String(max)} permis : raccourcissez-la.`,
    );
  }
}

/** Une description relue vide ou bordée d'espaces — l'écran n'en écrit jamais. */
export class PromotionDescriptionNotCanonicalError extends DomainError {
  constructor() {
    super(
      "promotions.description_not_canonical",
      "La description de la promotion est vide ou commence ou finit par des espaces : réécrivez-la, ou effacez-la.",
    );
  }
}
