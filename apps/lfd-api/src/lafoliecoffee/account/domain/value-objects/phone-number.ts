import { InvalidPhoneError } from "../errors/account-errors.js";

const PHONE_ALLOWED = /^[0-9+().\-\s]+$/u;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 15; // maximum d'un numéro E.164

/**
 * Téléphone d'une personne — **facultatif**.
 *
 * `empty()` représente « non renseigné » : le domaine porte donc l'absence
 * explicitement, plutôt que de laisser chaque appelant décider entre `null`,
 * `undefined` et `''`.
 *
 * La saisie est conservée **telle que l'utilisateur l'a écrite** (`01 42 71 08 44`,
 * `+33 6 12 34 56 78`) : c'est un libellé de contact, pas une clé. On ne valide
 * que le nombre de chiffres et l'absence de caractères qui trahissent une faute
 * de saisie — reformater casserait des numéros internationaux légitimes.
 */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  /** Le numéro non renseigné. */
  static empty(): PhoneNumber {
    return new PhoneNumber("");
  }

  /** Une chaîne vide (ou blanche) vaut « non renseigné », pas une erreur. */
  static create(raw: string): PhoneNumber {
    const trimmed = raw.trim().replace(/\s+/gu, " ");
    if (trimmed === "") {
      return PhoneNumber.empty();
    }

    if (!PHONE_ALLOWED.test(trimmed)) {
      throw new InvalidPhoneError(raw, "chiffres, espaces et + ( ) . - uniquement");
    }

    const digits = trimmed.replace(/\D/gu, "").length;
    if (digits < PHONE_MIN_DIGITS) {
      throw new InvalidPhoneError(raw, `au moins ${PHONE_MIN_DIGITS} chiffres`);
    }
    if (digits > PHONE_MAX_DIGITS) {
      throw new InvalidPhoneError(raw, `au plus ${PHONE_MAX_DIGITS} chiffres`);
    }

    return new PhoneNumber(trimmed);
  }

  get isEmpty(): boolean {
    return this.value === "";
  }

  toString(): string {
    return this.value;
  }
}
