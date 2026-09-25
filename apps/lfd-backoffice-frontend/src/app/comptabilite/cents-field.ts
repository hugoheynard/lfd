import { centsFromMillicents, millicentsFromCents, MILLICENTS_PER_CENT } from '@lfd/money';

import { millicentsField, millicentsOf } from '../commercial/tarification/grille/price-field';

/**
 * Un montant en euros saisi à la main → des **centimes entiers**. `null` si
 * illisible, nul, ou plus fin que le centime.
 *
 * Aucune conversion n'est écrite ici : la lecture exacte, chiffre à chiffre,
 * est celle de `millicentsOf` (aucun flottant), et la descente au centime celle
 * de `@lfd/money`. On REFUSE en revanche ce que `millicentsOf` arrondirait :
 * une somme demandée à un client ne se retouche pas en silence — « 12,345 »
 * n'est ni 12,34 ni 12,35, c'est une saisie à reprendre.
 */
export function centsOf(raw: string): number | null {
  const millicents = millicentsOf(raw);
  if (millicents === null || millicents <= 0 || millicents % MILLICENTS_PER_CENT !== 0) {
    return null;
  }
  return centsFromMillicents(millicents);
}

/** Des centimes → les euros à poser dans un champ (« 12,50 »). */
export function centsField(cents: number): string {
  return millicentsField(millicentsFromCents(cents));
}
