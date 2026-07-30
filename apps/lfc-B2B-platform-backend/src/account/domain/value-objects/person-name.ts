import { InvalidPersonNameError } from "../errors/account-errors.js";

export const PERSON_NAME_MAX_LENGTH = 80;

/**
 * Prénom ou nom d'une personne.
 *
 * Aucune validation de charset : les noms propres contiennent des accents, des
 * traits d'union, des apostrophes, des espaces (« Ngô Thị », « d'Artagnan »,
 * « Le Goff »). Tenter de les restreindre écarte des vraies personnes — on se
 * limite donc à ce qui est réellement faux : le vide et l'excès.
 *
 * `create()` est le seul constructeur : un nom invalide n'existe pas en mémoire.
 */
export class PersonName {
  private constructor(readonly value: string) {}

  /** @param field libellé du champ, pour que l'erreur dise lequel est en cause. */
  static create(raw: string, field: string): PersonName {
    const trimmed = raw.trim().replace(/\s+/gu, " ");

    if (trimmed === "") {
      throw new InvalidPersonNameError(field, "obligatoire");
    }
    if (trimmed.length > PERSON_NAME_MAX_LENGTH) {
      throw new InvalidPersonNameError(field, `au plus ${PERSON_NAME_MAX_LENGTH} caractères`);
    }

    return new PersonName(trimmed);
  }

  toString(): string {
    return this.value;
  }
}
