import { InvalidVatNumberError, VatSirenMismatchError } from "../errors/account-errors.js";

/** Un numéro intracommunautaire : deux lettres de pays, puis 2 à 13 caractères. */
const VAT_SHAPE = /^[A-Z]{2}[0-9A-Z+*]{2,13}$/u;

/** Un numéro français : « FR », la clé (deux caractères), le SIREN. */
const FRENCH_VAT = /^FR([0-9A-Z]{2})(\d{9})$/u;

const FRENCH_KEY_MODULUS = 97;
const FRENCH_KEY_OFFSET = 12;
const FRENCH_KEY_FACTOR = 3;

/**
 * Le numéro de TVA intracommunautaire saisi, **normalisé** (sans espaces ni
 * points, en capitales) et contrôlé hors ligne, ou la chaîne vide.
 *
 * Un numéro français se vérifie entièrement : sa clé numérique se calcule
 * depuis le SIREN qu'il porte. Une clé en lettres (l'ancien format, encore
 * valide) n'a pas de formule publique : seule sa forme est contrôlée. Un
 * numéro d'un autre pays de l'Union n'est contrôlé que dans sa forme.
 *
 * @throws {InvalidVatNumberError} forme invalide, ou clé française fausse.
 */
export function normalizedVatNumber(raw: string): string {
  const value = raw.replace(/[\s.-]/gu, "").toUpperCase();
  if (value === "") {
    return "";
  }
  if (!VAT_SHAPE.test(value)) {
    throw new InvalidVatNumberError(raw, "deux lettres de pays, puis le numéro");
  }
  const french = FRENCH_VAT.exec(value);
  if (value.startsWith("FR") && french === null) {
    throw new InvalidVatNumberError(
      raw,
      "« FR », deux caractères de clé, puis les 9 chiffres du SIREN",
    );
  }
  if (french !== null) {
    const [, key = "", siren = ""] = french;
    if (/^\d{2}$/u.test(key) && Number(key) !== frenchKeyOf(siren)) {
      throw new InvalidVatNumberError(
        raw,
        "la clé ne correspond pas au SIREN (vérifiez la saisie)",
      );
    }
  }
  return value;
}

/**
 * Un numéro français porte le SIREN de la société : s'il en porte un autre,
 * c'est le numéro d'une autre entreprise. Un numéro étranger, ou une société
 * sans SIREN connu, ne se compare pas.
 *
 * @throws {VatSirenMismatchError}
 */
export function ensureVatMatchesSiren(vatNumber: string, siren: string): void {
  const french = FRENCH_VAT.exec(vatNumber);
  const carried = french?.[2];
  if (carried !== undefined && siren !== "" && carried !== siren) {
    throw new VatSirenMismatchError(vatNumber, siren);
  }
}

/** La clé française : (12 + 3 × (SIREN mod 97)) mod 97. */
function frenchKeyOf(siren: string): number {
  return (
    (FRENCH_KEY_OFFSET + FRENCH_KEY_FACTOR * (Number(siren) % FRENCH_KEY_MODULUS)) %
    FRENCH_KEY_MODULUS
  );
}
