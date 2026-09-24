import { describe, expect, it } from 'vitest';

import { FORMATS, type PlacedBlock } from '../storefront-grid';
import {
  hasMobileOption,
  mobileFormat,
  mobileSequence,
  setApplyOnMobile,
} from '../storefront-mobile';

const ALL = ['all'] as const;

const tile: PlacedBlock = { id: 't', format: 'tile', column: 1, row: 1, shelves: ALL };
const card: PlacedBlock = { id: 'c', format: 'card', column: 3, row: 1, shelves: ALL };
const tileRight: PlacedBlock = { id: 'b', format: 'tile', column: 4, row: 1, shelves: ALL };
const kakemono: PlacedBlock = { id: 'v', format: 'kakemono', column: 2, row: 2, shelves: ALL };
const hero: PlacedBlock = { id: 'h', format: 'hero', column: 3, row: 5, shelves: ALL };
const band2: PlacedBlock = { id: 'd', format: 'doubleBand', column: 1, row: 3, shelves: ALL };

describe('le mobile', () => {
  it('seuls les formats plus grands que 1×1 ont l’option', () => {
    expect(FORMATS.filter((f) => hasMobileOption(f.format)).map((f) => f.format)).toEqual([
      'kakemono',
      'tile',
      'block',
      'hero',
      'band',
      'doubleBand',
    ]);
  });

  it('appliqué (ou absent) : la colonne « Pile » de la table', () => {
    const sizes = FORMATS.map((f) => {
      const m = mobileFormat({ id: 'x', format: f.format, column: 1, row: 1, shelves: ALL });
      return `${m.format} ${m.columns}×${m.rows}`;
    });
    expect(sizes).toEqual([
      'card 1×1',
      'kakemono 1×2',
      'tile 2×1',
      'block 2×2',
      'hero 2×2',
      'band 2×1',
      'doubleBand 2×2',
    ]);
  });

  it('non appliqué : réduit à une carte 1×1, quelle que soit la forme', () => {
    expect(mobileFormat({ ...tileRight, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
    expect(mobileFormat({ ...band2, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
  });

  it('le hero réduit devient une carte 1×1', () => {
    expect(mobileFormat({ ...hero, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
  });

  it('le hero réduit devient une carte 1×1', () => {
    expect(mobileFormat({ ...hero, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
  });

  it('le kakémono réduit devient une carte 1×1', () => {
    expect(mobileFormat({ ...kakemono, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
  });

  it('un format 1×1 reste lui-même, quelle que soit l’option', () => {
    expect(mobileFormat({ ...card, applyOnMobile: false })).toEqual({
      format: 'card',
      columns: 1,
      rows: 1,
    });
  });

  it('setApplyOnMobile règle l’option, sauf sur un 1×1', () => {
    expect(setApplyOnMobile([tile, card], 't', false)).toEqual([
      { ...tile, applyOnMobile: false },
      card,
    ]);
    expect(setApplyOnMobile([card], 'c', false)).toEqual([card]);
  });

  it('mobileSequence mêle objets et cases libres en ordre de lecture du bureau', () => {
    const tileOff: PlacedBlock = { ...tile, applyOnMobile: false };
    const sequence = mobileSequence([band2, tileOff, card], 4);
    const read = sequence.map((item) =>
      item.type === 'block'
        ? `${item.mobile.format} ${item.mobile.columns}×${item.mobile.rows}`
        : `libre ${item.cell.column},${item.cell.row}`,
    );
    expect(read).toEqual([
      'card 1×1',
      'card 1×1',
      'libre 4,1',
      'libre 5,1',
      'libre 1,2',
      'libre 2,2',
      'libre 3,2',
      'libre 4,2',
      'libre 5,2',
      'doubleBand 2×2',
    ]);
  });
});
