import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Phrase } from '../phrase';

/**
 * **La comptabilité** — l'entité émettrice et les mandats SEPA (famille `accounting` du catalogue des faits). Valeurs : `values/accounting-values.ts`.
 *
 * Ouvert vide au lot D (2026-09-19) pour que le registre n'ait plus à bouger
 * pendant qu'on écrit les phrases : voir le guide en tête de
 * `phrase-registry.ts`.
 */
export const ACCOUNTING_PHRASES = {} as const satisfies Partial<Record<JournalFactType, Phrase>>;
