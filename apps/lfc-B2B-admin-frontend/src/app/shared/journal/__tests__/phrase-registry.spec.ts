import { isJournalFactType } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { PHRASES } from '../phrases/phrase-registry';

/**
 * **Le registre des phrases** (plan des phrases du journal, lot D,
 * 2026-09-19).
 *
 * Qu'aucun type du catalogue ne manque, c'est le TYPAGE qui le dit : le
 * registre est un `Record<JournalFactType, Phrase>`, et un type ajouté au
 * catalogue ne compile pas tant qu'il n'a pas sa phrase. La liste figée des
 * types sans phrase qu'on tenait ici pendant le lot C a disparu avec elle.
 *
 * Reste ce que le typage ne voit pas : une clé de trop. Les familles de
 * phrases s'assemblent par étalement, et une entrée hors catalogue n'y
 * lèverait rien.
 */
describe('le registre des phrases', () => {
  it('ne donne de phrase qu’à des types du catalogue', () => {
    const unknown = Object.keys(PHRASES).filter((type) => !isJournalFactType(type));

    expect(unknown).toEqual([]);
  });
});
