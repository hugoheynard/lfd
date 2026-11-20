import type {
  PublishedCatalogView,
  PublishedCellCounts,
  PublishedEntryView,
  PublishedVariantView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  articlesOf,
  intentSubjectOf,
  isOpenUnder,
  type MenuArticle,
  type MenuDraft,
  menuIndicator,
  siteMenuStateLine,
  OPEN_DRAFT,
  sameDraft,
  staleEntries,
  withEffect,
} from '../sub-account-menu-draft';

const NO_CELLS: PublishedCellCounts = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

const TARTE: MenuArticle = { sku: 'TAR-6', productSku: 'TAR', familyPath: ['patisserie', 'sucre'] };

function draft(partial: Partial<MenuDraft>): MenuDraft {
  return { ...OPEN_DRAFT, ...partial };
}

function variant(sku: string, sold = true): PublishedVariantView {
  return {
    sku,
    name: sku,
    onSale: sold,
    isDefault: false,
    saleUnit: 'piece',
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: sold ? 'en_vente' : 'pas_vendu', htMillicents: 100_000 },
    public: { state: 'pas_vendu', ttcCents: null },
  };
}

function entry(productSku: string, variants: readonly PublishedVariantView[]): PublishedEntryView {
  return {
    productId: productSku,
    productSku,
    name: productSku,
    categoryId: 'patisserie',
    categoryPath: ['patisserie', 'sucre'],
    status: 'active',
    audience: 'pro',
    audienceInherited: true,
    familyAudience: 'pro',
    variants,
    receivedAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('isOpenUnder', () => {
  it('sans entrée, le mode donne le défaut', () => {
    expect(isOpenUnder(draft({ mode: 'except' }), TARTE)).toBe(true);
    expect(isOpenUnder(draft({ mode: 'only' }), TARTE)).toBe(false);
  });

  it('le SKU l’emporte sur le produit, qui l’emporte sur la famille', () => {
    let d = withEffect(draft({ mode: 'except' }), 'family', 'patisserie', 'exclude');
    expect(isOpenUnder(d, TARTE)).toBe(false);
    d = withEffect(d, 'product', 'TAR', 'include');
    expect(isOpenUnder(d, TARTE)).toBe(true);
    d = withEffect(d, 'sku', 'TAR-6', 'exclude');
    expect(isOpenUnder(d, TARTE)).toBe(false);
  });

  it('la famille la plus proche l’emporte sur sa parente', () => {
    let d = withEffect(draft({ mode: 'only' }), 'family', 'sucre', 'include');
    expect(isOpenUnder(d, TARTE)).toBe(true);
    d = withEffect(d, 'family', 'patisserie', 'exclude');
    expect(isOpenUnder(d, TARTE)).toBe(false);
  });
});

describe('withEffect et sameDraft', () => {
  it('« hérite » retire l’entrée, et l’ordre ne compte pas', () => {
    const a = withEffect(withEffect(OPEN_DRAFT, 'sku', 'A', 'exclude'), 'sku', 'B', 'exclude');
    const b = withEffect(withEffect(OPEN_DRAFT, 'sku', 'B', 'exclude'), 'sku', 'A', 'exclude');
    expect(sameDraft(a, b)).toBe(true);
    expect(withEffect(a, 'sku', 'A', 'inherit').entries).toEqual([
      { level: 'sku', ref: 'B', effect: 'exclude' },
    ]);
  });
});

describe('articlesOf', () => {
  it('ne garde que les déclinaisons vendues aux pros', () => {
    expect(articlesOf(entry('TAR', [variant('TAR-6'), variant('TAR-8', false)]))).toEqual([TARTE]);
  });
});

describe('staleEntries', () => {
  it('nomme les entrées que le catalogue ne connaît plus, par grain', () => {
    const catalogue: PublishedCatalogView = {
      shelves: [
        {
          categoryId: 'patisserie',
          name: 'Pâtisserie',
          position: 0,
          withdrawn: false,
          pro: NO_CELLS,
          public: NO_CELLS,
        },
      ],
      entries: [entry('TAR', [variant('TAR-6')])],
      pendingReview: [],
    };
    const d: MenuDraft = draft({
      entries: [
        { level: 'family', ref: 'patisserie', effect: 'exclude' },
        { level: 'family', ref: 'disparue', effect: 'exclude' },
        { level: 'product', ref: 'TAR', effect: 'include' },
        { level: 'product', ref: 'TAR-6', effect: 'include' },
        { level: 'sku', ref: 'TAR-6', effect: 'include' },
      ],
    });
    expect(staleEntries(d, catalogue).map((e) => `${e.level}:${e.ref}`)).toEqual([
      'family:disparue',
      'product:TAR-6',
    ]);
  });
});

describe('menuIndicator', () => {
  it('rien sans carte ; sinon son origine, sa forme et son nombre d’entrées', () => {
    expect(menuIndicator('none', null)).toBeNull();
    expect(menuIndicator('own', { mode: 'only', offMenu: 'hidden', entryCount: 0 })).toBe(
      'Carte propre : liste blanche, aucune entrée',
    );
    expect(menuIndicator('common', { mode: 'except', offMenu: 'hidden', entryCount: 2 })).toBe(
      'Carte commune : liste noire, 2 entrées',
    );
  });
});

describe('siteMenuStateLine', () => {
  const body = {
    mode: 'except' as const,
    offMenu: 'hidden' as const,
    entries: [],
    updatedAt: '2026-11-20T00:00:00.000Z',
    updatedBy: 'staff' as const,
  };

  it('une carte propre « tout, sans exception » posée sous une carte commune exempte le site', () => {
    const line = siteMenuStateLine({ companyId: 's', state: 'own', menu: body, common: body });
    expect(line).toContain('masque la carte commune');
    expect(line).toContain('exempté');
  });

  it('dit le site qui suit la carte commune, et celui qui n’a pas de carte', () => {
    expect(
      siteMenuStateLine({ companyId: 's', state: 'common', menu: null, common: body }),
    ).toContain('suit la carte commune');
    expect(
      siteMenuStateLine({ companyId: 's', state: 'none', menu: null, common: null }),
    ).toContain('pas de carte');
  });
});

describe('intentSubjectOf', () => {
  it('le même brouillon, dans un autre ordre, garde le sujet ; une autre carte en change', () => {
    const a = withEffect(withEffect(OPEN_DRAFT, 'sku', 'A', 'exclude'), 'sku', 'B', 'exclude');
    const b = withEffect(withEffect(OPEN_DRAFT, 'sku', 'B', 'exclude'), 'sku', 'A', 'exclude');
    expect(intentSubjectOf('c1', a)).toBe(intentSubjectOf('c1', b));
    expect(intentSubjectOf('c1', a)).not.toBe(intentSubjectOf('c1', { ...a, mode: 'only' }));
    expect(intentSubjectOf('c1', a)).not.toBe(intentSubjectOf('c2', a));
  });
});
