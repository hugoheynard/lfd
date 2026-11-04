import { ORDER_TOTAL_CHANGED } from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';

/**
 * Le refus « le total a changé depuis l'estimation » (409, plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, T3) — lu sur le
 * **code**, jamais sur la phrase. Ce n'est pas une panne : la saisie
 * redemande une estimation, et dit ce qui a bougé avant de laisser confirmer.
 */
export function isTotalChangedRefusal(error: unknown): boolean {
  return httpErrorCode(error) === ORDER_TOTAL_CHANGED;
}
