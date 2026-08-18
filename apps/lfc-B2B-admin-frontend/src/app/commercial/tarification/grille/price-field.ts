/**
 * **La saisie d'un prix, en chaîne.**
 *
 * Les prix vivent en chaînes dans le brouillon et non en centimes : un champ
 * qu'on vide doit pouvoir rester vide le temps qu'on tape le nombre suivant.
 * Convertir à chaque frappe rendait « 0, » en zéro, puis remettait « 0 » dans le
 * champ sous les doigts.
 */

/** Un prix en euros saisi à la main → des centimes. `null` si illisible. */
export function centsOf(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

/** Les euros d'un montant en centimes, pour préremplir un champ. */
export function eurosField(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
