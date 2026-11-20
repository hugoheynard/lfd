import { describe, expect, it } from 'vitest';

import { NESTED_CATALOGUE } from '../shop/shop-catalogue.fixture';
import {
  draftOf,
  effectAt,
  familyPathOf,
  isOpenUnder,
  type MenuDraft,
  OPEN_DRAFT,
  sameDraft,
  staleEntries,
  withEffect,
} from './site-menu-draft';

const SHELVES = NESTED_CATALOGUE.shelves;
const OPERA = { sku: 'PAT-OPE', shelfId: 'cat_ent_8' };
const TART = { sku: 'PAT-TAR', shelfId: 'cat_tar' };
const CROISSANT = { sku: 'VIE-001', shelfId: 'cat_vien' };

function draft(over: Partial<MenuDraft>): MenuDraft {
  return { ...OPEN_DRAFT, ...over };
}

describe('la carte composée à l’écran', () => {
  it('part de « tout, sans exception » quand aucune carte n’est posée', () => {
    expect(draftOf(null)).toEqual({ mode: 'except', offMenu: 'visible_locked', entries: [] });
  });

  it('lit la lignée d’une famille, la plus proche d’abord', () => {
    expect(familyPathOf('cat_ent_8', SHELVES)).toEqual(['cat_ent_8', 'cat_ent', 'cat_patis']);
  });

  it('règle un nœud, puis le rend à l’héritage', () => {
    const excluded = withEffect(OPEN_DRAFT, 'family', 'cat_patis', 'exclude');
    expect(effectAt(excluded, 'family', 'cat_patis')).toBe('exclude');
    const back = withEffect(excluded, 'family', 'cat_patis', 'inherit');
    expect(back.entries).toEqual([]);
  });

  it('remplace l’effet d’un nœud déjà réglé, sans doublon', () => {
    const once = withEffect(OPEN_DRAFT, 'product', 'PAT-TAR', 'exclude');
    const twice = withEffect(once, 'product', 'PAT-TAR', 'include');
    expect(twice.entries).toEqual([{ level: 'product', ref: 'PAT-TAR', effect: 'include' }]);
  });

  it('compare deux cartes sans tenir compte de l’ordre des entrées', () => {
    const a = withEffect(
      withEffect(OPEN_DRAFT, 'family', 'x', 'exclude'),
      'product',
      'y',
      'include',
    );
    const b = withEffect(
      withEffect(OPEN_DRAFT, 'product', 'y', 'include'),
      'family',
      'x',
      'exclude',
    );
    expect(sameDraft(a, b)).toBe(true);
    expect(sameDraft(a, { ...b, offMenu: 'hidden' })).toBe(false);
  });
});

describe('le jugement rejoué (§ 3.3)', () => {
  it('sans entrée, le mode donne le défaut', () => {
    expect(isOpenUnder(draft({ mode: 'except' }), OPERA, SHELVES)).toBe(true);
    expect(isOpenUnder(draft({ mode: 'only' }), OPERA, SHELVES)).toBe(false);
  });

  it('la famille parente touche tout son sous-arbre', () => {
    const menu = draft({ entries: [{ level: 'family', ref: 'cat_patis', effect: 'exclude' }] });
    expect(isOpenUnder(menu, OPERA, SHELVES)).toBe(false);
    expect(isOpenUnder(menu, TART, SHELVES)).toBe(false);
    expect(isOpenUnder(menu, CROISSANT, SHELVES)).toBe(true);
  });

  it('l’exception d’une exception : « tout sauf Pâtisseries, mais la tarte »', () => {
    const menu = draft({
      entries: [
        { level: 'family', ref: 'cat_patis', effect: 'exclude' },
        { level: 'product', ref: 'PAT-TAR', effect: 'include' },
      ],
    });
    expect(isOpenUnder(menu, TART, SHELVES)).toBe(true);
    expect(isOpenUnder(menu, OPERA, SHELVES)).toBe(false);
  });

  it('la famille la plus proche l’emporte sur ses parentes', () => {
    const menu = draft({
      mode: 'only',
      entries: [
        { level: 'family', ref: 'cat_patis', effect: 'include' },
        { level: 'family', ref: 'cat_ent', effect: 'exclude' },
      ],
    });
    expect(isOpenUnder(menu, TART, SHELVES)).toBe(true);
    expect(isOpenUnder(menu, OPERA, SHELVES)).toBe(false);
  });

  it('le SKU l’emporte sur le produit', () => {
    const menu = draft({
      entries: [
        { level: 'product', ref: 'PAT-OPE', effect: 'exclude' },
        { level: 'sku', ref: 'PAT-OPE', effect: 'include' },
      ],
    });
    expect(isOpenUnder(menu, OPERA, SHELVES)).toBe(true);
  });
});

describe('les entrées qui dorment', () => {
  it('nomme celles que le catalogue ne montre plus', () => {
    const menu = draft({
      entries: [
        { level: 'family', ref: 'cat_patis', effect: 'exclude' },
        { level: 'family', ref: 'cat_gone', effect: 'exclude' },
        { level: 'product', ref: 'PAT-TAR', effect: 'include' },
        { level: 'sku', ref: 'GONE-1', effect: 'include' },
      ],
    });
    expect(staleEntries(menu, NESTED_CATALOGUE.items, SHELVES).map((entry) => entry.ref)).toEqual([
      'cat_gone',
      'GONE-1',
    ]);
  });
});
