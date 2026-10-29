import { httpErrorCode } from '@lfd/endpoints';

/**
 * Le refus « une ligne est sous la quantité minimale de l'article » (409,
 * plan `documentation/catalogue/plan-quantite-minimale.md`, M4).
 *
 * Le code, jamais le message : le message du serveur nomme déjà l'article et
 * le minimum, et c'est lui que le toast montre.
 */
const QUANTITY_BELOW_MINIMUM = 'orders.line.quantity_below_minimum';

/**
 * Ce refus se corrige à la saisie : il se dit dans un toast qui s'efface,
 * pas comme une panne qui reste en travers de l'écran.
 */
export function isBelowMinimumRefusal(error: unknown): boolean {
  return httpErrorCode(error) === QUANTITY_BELOW_MINIMUM;
}
