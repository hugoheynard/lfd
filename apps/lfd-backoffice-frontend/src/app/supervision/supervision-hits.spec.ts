import { describe, expect, it } from 'vitest';

import { hitAt, hitCountsOf, type HitBoards, hitsOf } from './supervision-hits';
import { NO_MATCHES, type SupervisionMatches } from './supervision-search';

const ref = (reference: string) => ({ reference });

const BOARDS: HitBoards = {
  preparation: {
    open: [{ pending: [{ sku: 'S2' }], done: [{ sku: 'S1' }] }],
    finished: [{ pending: [], done: [{ sku: 'S3' }] }],
  },
  packing: { upcoming: [], visible: [ref('B'), ref('A')], packed: [ref('C')] },
  handover: { pickup: [{ rows: [ref('A')] }], delivery: [{ rows: [ref('C')] }] },
};

function matches(references: readonly string[], skus: readonly string[]): SupervisionMatches {
  return { ...NO_MATCHES, mode: 'search', references: new Set(references), skus: new Set(skus) };
}

describe('hitsOf — ‹ n / m › (Supervision v2, A1)', () => {
  it('ordonne colonne 1, 2, 3, et dans chacune l’ordre où elle montre', () => {
    const hits = hitsOf(matches(['A', 'C'], ['S1', 'S3']), BOARDS);

    expect(hits.map((hit) => `${hit.column}:${hit.key}`)).toEqual([
      'preparation:S1',
      'preparation:S3',
      'packing:A',
      'packing:C',
      'handover:A',
      'handover:C',
    ]);
    expect(hitCountsOf(hits)).toEqual({ preparation: 2, packing: 2, handover: 2 });
  });

  it('rien n’est parcouru sans mise en avant', () => {
    expect(hitsOf(NO_MATCHES, BOARDS)).toEqual([]);
  });

  it('le curseur tourne dans les deux sens', () => {
    const hits = hitsOf(matches(['A'], []), BOARDS);

    expect(hitAt(hits, 0)?.hit).toEqual({ column: 'packing', key: 'A' });
    expect(hitAt(hits, -1)?.hit).toEqual({ column: 'handover', key: 'A' });
    expect(hitAt(hits, 2)?.index).toBe(0);
    expect(hitAt([], 3)).toBeNull();
  });
});
