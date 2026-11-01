import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Les refus du texte d'une promotion sur les vignettes**
 * (`documentation/promotions/plan-texte-de-la-vignette.md`). Rangés à part :
 * `promotion-errors.ts` dépasse déjà la taille d'un fichier.
 */

/** Un texte de vignette plus long que la borne. */
export class PromotionTileTextTooLongError extends DomainError {
  constructor(
    readonly length: number,
    readonly max: number,
  ) {
    super(
      "promotions.tile_text_too_long",
      `Le texte sur les vignettes fait ${String(length)} caractères, au-delà des ${String(max)} permis : raccourcissez-le, il doit tenir sur une vignette.`,
    );
  }
}

/** Un texte relu vide ou bordé d'espaces — l'écran n'en écrit jamais. */
export class PromotionTileTextNotCanonicalError extends DomainError {
  constructor() {
    super(
      "promotions.tile_text_not_canonical",
      "Le texte sur les vignettes est vide ou commence ou finit par des espaces : réécrivez-le, ou effacez-le.",
    );
  }
}

/** Une traduction sans texte français, auquel elle se replie. */
export class PromotionTileTextWithoutFrenchError extends DomainError {
  constructor() {
    super(
      "promotions.tile_text_without_french",
      "Le texte sur les vignettes a une traduction mais pas de français : écrivez le texte français, ou effacez les traductions.",
    );
  }
}
