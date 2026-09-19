import { isJournalFactType, JOURNAL_FACT_TYPES } from '@lfd/contracts/journal-facts';
import { describe, expect, it } from 'vitest';

import { PHRASES } from '../phrases/phrase-registry';

/**
 * **Les types sans phrase — une liste qui ne peut que décroître** (plan des
 * phrases du journal, lot C, 2026-09-19).
 *
 * Le registre est un `Partial` pendant le lot C ; le lot D écrit les phrases
 * famille par famille et le passe en `Record` complet, ce qui rendra ce test
 * inutile — on le supprimera alors avec cette liste vide.
 *
 * D'ici là, la liste est FIGÉE : un type ajouté au catalogue sans phrase la
 * fait échouer (il faut l'écrire, ou l'inscrire ici en connaissance de cause),
 * et une phrase écrite sans retirer son type d'ici aussi — la liste reste le
 * relevé exact de ce qui manque.
 */
const WITHOUT_PHRASE: readonly string[] = [];

describe('le registre des phrases (lot C)', () => {
  it('ne laisse sans phrase que les types de la liste figée — ni plus, ni moins', () => {
    const without = JOURNAL_FACT_TYPES.filter((type) => PHRASES[type] === undefined);

    expect([...without].sort()).toEqual([...WITHOUT_PHRASE].sort());
  });

  it('ne donne de phrase qu’à des types du catalogue', () => {
    const unknown = Object.keys(PHRASES).filter((type) => !isJournalFactType(type));

    expect(unknown).toEqual([]);
  });
});
