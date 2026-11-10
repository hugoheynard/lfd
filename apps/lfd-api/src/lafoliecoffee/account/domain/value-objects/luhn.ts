/**
 * Clé de Luhn, calculée de droite à gauche : un chiffre sur deux est doublé, et
 * un doublement au-delà de 9 se réduit en lui retirant 9. La somme doit être un
 * multiple de 10.
 *
 * Partagée par `Siret` et `Siren` du même contexte : les deux identifiants de
 * l'INSEE portent la même clé, et la tenir à deux endroits d'un même dossier
 * laisserait l'une diverger de l'autre. La migration
 * `20260915120000_siren_et_forme_juridique_du_titulaire` la recalcule en SQL
 * sur 9 chiffres — c'est la même règle, écrite dans l'autre langue.
 *
 * @param digits une chaîne déjà prouvée numérique par l'appelant.
 */
export function isLuhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    const digit = Number(digits[fromRight]);
    const doubled = i % 2 === 1 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
}
