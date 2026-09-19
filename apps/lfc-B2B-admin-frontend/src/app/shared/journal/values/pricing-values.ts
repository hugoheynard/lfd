import { PRICE_SCOPE_LABELS } from '@lfd/contracts';

import { domain, type ValueFamily } from './value-domain';

/**
 * **La tarification négociée** — règles, limites, barèmes, mercuriales,
 * engagements de volume (famille `pricing` du catalogue des faits).
 */

/** Ce qu'un engagement de volume vise — les mots de la tarification (`PRICE_SCOPE_LABELS`). */
export const PRICE_SCOPE = domain('portée tarifaire', PRICE_SCOPE_LABELS);

export const PRICING_VALUES: ValueFamily = {
  enums: [PRICE_SCOPE],
};
