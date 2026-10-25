import {
  ShortfallLetterRequiredError,
  ShortfallLetterTooLongError,
} from "../errors/shortfall-letter-errors.js";

/** Assez pour une lettre courte, pas pour un dossier. */
export const SHORTFALL_LETTER_MAX_LENGTH = 4000;

/**
 * **Le texte que l'équipe envoie au client** après un départ incomplet (plan
 * `documentation/commandes/plan-e6d-ecrire-au-client.md`) : la proposition du
 * dictionnaire, relue et corrigée. C'est lui qui part, tel quel.
 *
 * Le contrôleur ne valide que la forme (une chaîne) ; le vide et l'excès
 * sont refusés ici.
 */
export class ShortfallLetter {
  private constructor(readonly text: string) {}

  /**
   * @throws {ShortfallLetterRequiredError} vide, ou seulement des espaces.
   * @throws {ShortfallLetterTooLongError} plus de 4000 caractères.
   */
  static of(raw: string): ShortfallLetter {
    const text = raw.trim();
    if (text === "") {
      throw new ShortfallLetterRequiredError();
    }
    if (text.length > SHORTFALL_LETTER_MAX_LENGTH) {
      throw new ShortfallLetterTooLongError(SHORTFALL_LETTER_MAX_LENGTH);
    }
    return new ShortfallLetter(text);
  }
}
