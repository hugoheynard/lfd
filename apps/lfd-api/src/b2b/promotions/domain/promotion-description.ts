import {
  PromotionDescriptionNotCanonicalError,
  PromotionDescriptionTooLongError,
} from "./errors/promotion-description-errors.js";

/**
 * La longueur maximale de la description interne d'une promotion. Mille
 * caractères disent un contexte (« pour écouler les croissants du mardi,
 * vue avec le fournil ») sans devenir un document ; la colonne porte le même
 * CHECK (migration `20261031220000_la_description_des_promotions`).
 */
export const PROMOTION_DESCRIPTION_MAX_LENGTH = 1000;

/**
 * **La description saisie, en forme canonique** : espaces de bord retirés,
 * vide → `null` (aucune description). Pour l'équipe seulement — le client ne
 * la voit jamais, et la phrase du journal ne la cite pas.
 *
 * @throws {PromotionDescriptionTooLongError} au-delà de la borne.
 */
export function promotionDescriptionOf(raw: string | null): string | null {
  const trimmed = raw?.trim() ?? "";
  const description = trimmed === "" ? null : trimmed;
  assertDescription(description);
  return description;
}

/**
 * Une description posée est déjà canonique (sans espaces de bord, non vide)
 * et bornée. Appelée à la pose, à la révision et à la relecture.
 *
 * @throws {PromotionDescriptionTooLongError} au-delà de la borne.
 * @throws {PromotionDescriptionNotCanonicalError} vide ou bordée d'espaces.
 */
export function assertDescription(description: string | null): void {
  if (description === null) {
    return;
  }
  if (description.length > PROMOTION_DESCRIPTION_MAX_LENGTH) {
    throw new PromotionDescriptionTooLongError(
      description.length,
      PROMOTION_DESCRIPTION_MAX_LENGTH,
    );
  }
  if (description.trim() !== description || description === "") {
    throw new PromotionDescriptionNotCanonicalError();
  }
}
