import { MILLICENTS_PER_CENT } from '@lfd/money';

/**
 * **La saisie d'un prix, en chaîne.**
 *
 * Les prix vivent en chaînes dans le brouillon et non en nombres : un champ
 * qu'on vide doit pouvoir rester vide le temps qu'on tape le nombre suivant.
 * Convertir à chaque frappe rendait « 0, » en zéro, puis remettait « 0 » dans le
 * champ sous les doigts.
 *
 * 🔴 **Ce fichier parlait CENTIMES jusqu'au 2026-09-06, seul de sa famille.**
 * Tous ses appelants lui donnaient et lui reprenaient des millicentimes, si bien
 * qu'un prix tapé à 2,10 € entrait en base à 0,0021 € et qu'une mercuriale
 * enregistrée avant la migration du 2026-08-31 se rouvrait à 3000,00 €. Le
 * défaut venait d'un renommage qui avait changé les noms sans convertir les
 * valeurs (`0e2e2dd2`) ; il est décrit sous `D10` dans
 * `documentation/pricing/audit-calcul-du-panier-et-du-prix.md`.
 *
 * L'unité de ce fichier est désormais le **millicentime**, comme le reste de la
 * famille et comme la base.
 */

/** Les décimales d'euro qu'un millicentime permet d'écrire. */
const DECIMALS = 5;

/** `10⁵` — d'un euro à son millicentime. Dérivé, jamais réécrit en dur. */
const MILLICENTS_PER_EURO = 100 * MILLICENTS_PER_CENT;

/**
 * Le plafond de la colonne Postgres qui reçoit ce prix (`Int`), en euros.
 *
 * Au-delà, la valeur ne peut pas être écrite. La refuser ICI la refuse là où
 * quelqu'un la tape et peut la corriger ; la laisser passer la ferait échouer
 * au `POST`, sur une grille entière, sans dire quelle ligne fâche.
 */
const MAX_MILLICENTS = 2_147_483_647;

/** Un nombre positif en écriture décimale, virgule ou point, décimales facultatives. */
const DECIMAL = /^(\d*)(?:[.](\d*))?$/u;

/**
 * Un prix en euros saisi à la main → des **millicentimes**. `null` si illisible.
 *
 * 🔴 **Le calcul est exact : la chaîne est lue chiffre à chiffre, sans passer par
 * un flottant.** `Number.parseFloat('19,99') * 100_000` vaut
 * `1998999.9999999998` en binaire — un arrondi le rattrape aujourd'hui, mais
 * c'est de la chance, pas une garantie, et c'est exactement ce que `@lfd/money`
 * existe pour supprimer.
 *
 * Cinq décimales sont acceptées, parce que c'est ce qu'un prix se négocie :
 * « 2,13456 € HT » est une saisie normale, pas un cas limite. Au-delà de cinq,
 * la valeur est **arrondie** au millicentime le plus proche, la moitié
 * s'éloignant de zéro — la même règle que partout ailleurs dans le dépôt.
 *
 * Refusé : le vide, le signe, une lettre, et tout ce qui dépasse la colonne.
 */
export function millicentsOf(raw: string): number | null {
  const match = DECIMAL.exec(raw.trim().replace(',', '.'));
  if (match === null) {
    return null;
  }
  const [, whole = '', fraction = ''] = match;
  // Une chaîne sans le moindre chiffre — « », « , », « . » — n'est pas un zéro :
  // c'est un champ qu'on n'a pas encore rempli.
  if (whole === '' && fraction === '') {
    return null;
  }

  // La sixième décimale décide de l'arrondi ; les suivantes ne peuvent plus le
  // changer, la moitié s'éloignant déjà de zéro.
  const digits = fraction.padEnd(DECIMALS + 1, '0');
  const millicents =
    Number(whole === '' ? '0' : whole) * MILLICENTS_PER_EURO + Number(digits.slice(0, DECIMALS));
  const rounded = digits.charAt(DECIMALS) >= '5' ? millicents + 1 : millicents;
  return rounded > MAX_MILLICENTS ? null : rounded;
}

/**
 * Un montant en **millicentimes** → les euros à poser dans un champ.
 *
 * **Deux décimales au moins, cinq au plus, et aucun zéro de remplissage entre
 * les deux** : « 2,00 » reste « 2,00 », « 2,13456 » garde ses cinq décimales.
 * Les afficher toutes ferait passer chaque prix rond pour un prix calculé — la
 * même règle que `formatEuros`, et pour la même raison.
 */
export function millicentsField(millicents: number): string {
  const safe = Math.max(0, Math.trunc(millicents));
  const whole = (safe - (safe % MILLICENTS_PER_EURO)) / MILLICENTS_PER_EURO;
  const fraction = String(safe % MILLICENTS_PER_EURO)
    .padStart(DECIMALS, '0')
    .replace(/0+$/u, '');
  return `${String(whole)},${fraction.length < 2 ? fraction.padEnd(2, '0') : fraction}`;
}
