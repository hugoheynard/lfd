import { PRICE_SCOPE_LABELS, PRICE_STAGE_LABELS } from '@lfd/contracts';

import { domain, type ValueFamily } from './value-domain';

/**
 * **La tarification négociée** — règles, limites, barèmes, mercuriales,
 * engagements de volume (famille `pricing` du catalogue des faits).
 */

/** Ce qu'un engagement de volume vise — les mots de la tarification (`PRICE_SCOPE_LABELS`). */
export const PRICE_SCOPE = domain('portée tarifaire', PRICE_SCOPE_LABELS);

/**
 * L'étage d'une règle (`price_rule.*`, forme du 2026-09-19) — les mots du
 * panneau tarifaire (`PRICE_STAGE_LABELS`), qui ouvrent aussi la phrase figée
 * de la règle (« Geste « Été » · … »).
 */
export const PRICE_STAGE = domain('étage tarifaire', PRICE_STAGE_LABELS);

export const PRICING_VALUES: ValueFamily = {
  enums: [PRICE_SCOPE, PRICE_STAGE],
};
