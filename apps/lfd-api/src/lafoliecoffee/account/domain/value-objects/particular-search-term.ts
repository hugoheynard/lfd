import { ParticularSearchTooShortError } from "../errors/particular-errors.js";
import { phoneMatchKey } from "../services/phone-match-key.js";

/** En deçà, tout le monde répond : ce n'est plus une recherche. */
export const PARTICULAR_SEARCH_MIN_LENGTH = 2;
/** Le comptoir choisit parmi peu : au-delà, il faut préciser. */
export const PARTICULAR_SEARCH_LIMIT = 10;

const PHONE_SHAPED = /^[0-9+().\-\s]+$/u;
const PHONE_MIN_DIGITS = 2;

/**
 * Ce que le comptoir tape pour retrouver un particulier : un téléphone, un
 * prénom ou un morceau d'adresse.
 *
 * `text` est la saisie en minuscules, sans blancs autour : elle se cherche
 * telle quelle dans le prénom, le nom et l'adresse — sans motif, donc un `_`
 * ou un `%` tapé reste un caractère. `phoneKey` n'existe que si la saisie a
 * la forme d'un numéro : `06 12` y devient `0612`, `+33 6` y devient `06`.
 */
export class ParticularSearchTerm {
  private constructor(
    readonly text: string,
    readonly phoneKey: string | null,
  ) {}

  /** @throws {ParticularSearchTooShortError} moins de deux caractères utiles. */
  static create(raw: string): ParticularSearchTerm {
    const text = raw.trim().replace(/\s+/gu, " ").toLowerCase();
    if (text.length < PARTICULAR_SEARCH_MIN_LENGTH) {
      throw new ParticularSearchTooShortError(PARTICULAR_SEARCH_MIN_LENGTH);
    }
    const key = PHONE_SHAPED.test(text) ? phoneMatchKey(text) : "";
    return new ParticularSearchTerm(text, key.length >= PHONE_MIN_DIGITS ? key : null);
  }
}
