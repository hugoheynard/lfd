const NON_DIGIT = /[^0-9]/gu;
const FRENCH_PREFIX_PLUS = "+33";
const FRENCH_PREFIX_ZEROS = "0033";
const FRENCH_COUNTRY_DIGITS = "33";
const NATIONAL_TRUNK = "0";

/**
 * La **clé de rapprochement** d'un téléphone : ses chiffres seuls, l'indicatif
 * français ramené au `0` national.
 *
 * `PhoneNumber` garde la saisie telle quelle — c'est un libellé de contact —, et
 * c'est juste : reformater casserait un numéro étranger. Mais deux graphies d'un
 * même numéro (`06 12 34 56 78`, `+33 6 12 34 56 78`, `0033612345678`) doivent
 * se reconnaître quand on cherche une personne ou qu'on refuse un doublon.
 * Cette clé ne s'écrit jamais en base : elle se calcule de part et d'autre.
 *
 * ⚠️ L'adaptateur SQL des particuliers (`particular-sql.ts`) recopie la même
 * règle en Postgres ; les deux changent ensemble.
 */
export function phoneMatchKey(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(NON_DIGIT, "");
  if (trimmed.startsWith(FRENCH_PREFIX_PLUS)) {
    return NATIONAL_TRUNK + digits.slice(FRENCH_COUNTRY_DIGITS.length);
  }
  if (digits.startsWith(FRENCH_PREFIX_ZEROS)) {
    return NATIONAL_TRUNK + digits.slice(FRENCH_PREFIX_ZEROS.length);
  }
  return digits;
}
