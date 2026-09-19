import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Phrase } from '../phrase';

/**
 * **Le commerce** — catalogue vendu aux pros, prospects, rendez-vous, recommandations du cockpit (famille `commerce` du catalogue des faits). Valeurs : `values/commerce-values.ts`.
 *
 * Ouvert vide au lot D (2026-09-19) pour que le registre n'ait plus à bouger
 * pendant qu'on écrit les phrases : voir le guide en tête de
 * `phrase-registry.ts`.
 */
export const COMMERCE_PHRASES = {} as const satisfies Partial<Record<JournalFactType, Phrase>>;
