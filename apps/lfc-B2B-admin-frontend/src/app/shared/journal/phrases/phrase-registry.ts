import type { JournalFactType } from '@lfd/contracts/journal-facts';

import type { Phrase } from '../phrase';

import { ACCOUNTS_PHRASES } from './accounts-phrases';
import { ORDERS_PHRASES } from './orders-phrases';
import { PRICING_PHRASES } from './pricing-phrases';
import { REFERENTIAL_PHRASES } from './referential-phrases';
import { SETTINGS_PHRASES } from './settings-phrases';
import { TEAM_PHRASES } from './team-phrases';

/**
 * **Le registre des phrases** : une par type du catalogue (D3 du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`).
 *
 * 🚧 `Partial` pendant le lot C, et c'est provisoire : le lot D écrit les
 * phrases famille par famille, puis passe ce type en `Record` complet — un
 * type ajouté au catalogue ne compilera plus tant qu'il n'aura pas sa phrase.
 * D'ici là, un type sans phrase a le repli du moteur (`fallback-phrase.ts`),
 * et `__tests__/phrase-registry.spec.ts` tient la liste de ceux qui manquent :
 * elle ne peut que décroître.
 */
export const PHRASES: Partial<Record<JournalFactType, Phrase>> = {
  ...REFERENTIAL_PHRASES,
  ...SETTINGS_PHRASES,
  ...ORDERS_PHRASES,
  ...PRICING_PHRASES,
  ...ACCOUNTS_PHRASES,
  ...TEAM_PHRASES,
};
