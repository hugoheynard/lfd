import { describe, expect, it } from 'vitest';

import type { EditorBlock } from '../storefront-block';
import {
  acrossMessage,
  checkAcross,
  moveAcross,
  placeAcross,
  setShelvesAcross,
} from '../storefront-placement';

/** « Tout » a six rangées, « Pains » deux. */
const rowsOf = (shelf: string): number => (shelf === 'bread' ? 2 : 6);
const label = (shelf: string): string => (shelf === 'bread' ? 'Pains' : 'Tout');

const band: EditorBlock = {
  id: 'b',
  format: 'doubleBand',
  column: 1,
  row: 1,
  shelves: ['all', 'bread'],
  tone: 'accent',
};

describe('la pose quand chaque rayon a ses rangées', () => {
  it('tient sur chaque rayon : posé, et ce que l’éditeur porte en plus est gardé', () => {
    const result = placeAcross([], rowsOf, band);
    expect(result.ok && result.blocks).toEqual([band]);
  });

  it('trop bas pour le rayon le plus court : refusé, et le rayon est nommé', () => {
    const low: EditorBlock = { ...band, row: 2 };
    const verdict = checkAcross([], rowsOf, low);
    expect(verdict).toEqual({ ok: false, reason: 'rows', on: 'bread' });
    if (verdict.ok) throw new Error('refus attendu');
    expect(acrossMessage(verdict, rowsOf, label)).toBe(
      'Sur le rayon « Pains » : Déborde des 2 rangées de la page.',
    );
  });

  it('sans rayon : refusé', () => {
    expect(checkAcross([], rowsOf, { ...band, shelves: [] })).toEqual({
      ok: false,
      reason: 'noShelf',
      on: null,
    });
  });

  it('un chevauchement sur un seul des rayons suffit à refuser', () => {
    const breadCard: EditorBlock = {
      id: 'c',
      format: 'card',
      column: 5,
      row: 2,
      shelves: ['bread'],
    };
    const result = placeAcross([breadCard], rowsOf, band);
    expect(result).toMatchObject({ ok: false, reason: 'overlap', shelf: 'bread', on: 'bread' });
  });

  it('déplacer d’un pas est jugé comme une pose ; un id inconnu ne change rien', () => {
    const blocks = [{ ...band, shelves: ['all'] }];
    const down = moveAcross(blocks, rowsOf, 'b', 0, 1);
    expect(down.ok && down.blocks[0]).toMatchObject({ row: 2, tone: 'accent' });
    expect(moveAcross(blocks, rowsOf, 'nope', 0, 1)).toEqual({ ok: true, blocks });
  });

  it('ajouter un rayon trop court est refusé ; les doublons sont ignorés', () => {
    const blocks = [{ ...band, row: 3, shelves: ['all'] }];
    expect(setShelvesAcross(blocks, rowsOf, 'b', ['all', 'bread']).ok).toBe(false);
    const same = setShelvesAcross(blocks, rowsOf, 'b', ['all', 'all']);
    expect(same.ok && same.blocks[0]?.shelves).toEqual(['all']);
  });
});
