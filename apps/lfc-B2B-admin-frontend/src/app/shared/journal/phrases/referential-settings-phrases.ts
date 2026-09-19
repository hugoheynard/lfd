import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Phrase } from '../phrase';

/**
 * **Ce qui règle le référentiel** — règles comptables, points et contextes de vente, provenance, allergènes, heures limites (famille `referentialSettings` du catalogue des faits, hors `vat_rate.*`, déjà dans `referential-phrases.ts`). Valeurs : `values/referential-values.ts`.
 *
 * Ouvert vide au lot D (2026-09-19) pour que le registre n'ait plus à bouger
 * pendant qu'on écrit les phrases : voir le guide en tête de
 * `phrase-registry.ts`.
 */
export const REFERENTIAL_SETTINGS_PHRASES = {} as const satisfies Partial<
  Record<JournalFactType, Phrase>
>;
