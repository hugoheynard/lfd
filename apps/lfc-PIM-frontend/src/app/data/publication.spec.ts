import { describe, expect, it } from 'vitest';

import {
  buildProjection,
  planPublication,
  type ProjectedFiche,
} from './publication';
import type { Category, Product, TvaRegime } from './models';

const REGIMES: TvaRegime[] = [
  { id: 't55', name: 'Réduit', description: '', percent: 5.5, tag: 'tva-5-5' },
  { id: 't10', name: 'Interm.', description: '', percent: 10, tag: 'tva-10' },
];

const CATEGORY: Category = {
  id: 'c1',
  name: { fr: 'Viennoiserie' },
  slug: { fr: 'viennoiserie' },
  parentId: null,
  position: 0,
  isArchived: false,
  channelPreset: {
    b1: { emporter: true, surPlace: true },
    b2: { emporter: true, surPlace: false },
  },
  emporterTvaId: 't55',
  surPlaceTvaId: 't10',
};

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    sku: 'PATI-CROISSANT',
    name: { fr: 'Croissant' },
    kind: 'daily',
    categoryId: 'c1',
    status: 'published',
    channelsOverride: null,
    variants: [
      {
        id: 'v1',
        sku: 'PATI-CROISSANT-U',
        name: { fr: 'Pièce' },
        isDefault: true,
        isDiscontinued: false,
        allergens: [],
      },
    ],
    ...over,
  };
}

function project(p: Product): Map<string, ProjectedFiche> {
  return buildProjection([p], [CATEGORY], REGIMES);
}

describe('buildProjection', () => {
  it('génère une fiche emporter et une fiche sur place, au SKU partagé', () => {
    const fiches = [...project(product()).values()];
    expect(fiches).toHaveLength(2);
    expect(fiches.every((f) => f.sku === 'PATI-CROISSANT')).toBe(true);
    const surPlace = fiches.find((f) => f.mode === 'surPlace');
    expect(surPlace?.handle).toBe('croissant-sur-place');
    expect(surPlace?.tvaTag).toBe('tva-10');
    expect(fiches.find((f) => f.mode === 'emporter')?.tvaTag).toBe('tva-5-5');
  });

  it('exclut un produit archivé', () => {
    expect(project(product({ status: 'archived' })).size).toBe(0);
  });
});

describe('planPublication', () => {
  it('marque « nouvelle » une fiche jamais publiée', () => {
    const plan = planPublication(project(product()), {});
    expect(plan.counts.new).toBe(2);
    expect(plan.entries.every((e) => e.status === 'new')).toBe(true);
  });

  it('marque « à jour » une fiche identique à la publiée', () => {
    const current = project(product());
    const published = Object.fromEntries(current);
    const plan = planPublication(current, published);
    expect(plan.counts['up-to-date']).toBe(2);
  });

  // NB : renommer changerait le handle (dérivé du nom) → nouvelle + à retirer,
  // pas un drift. On drive donc le drift par une déclinaison (nom inchangé).
  it('marque « modifiée » et liste le diff quand une déclinaison change', () => {
    const published = Object.fromEntries(project(product()));
    const current = project(
      product({
        variants: [
          {
            id: 'v1',
            sku: 'PATI-CROISSANT-U',
            name: { fr: 'Grande pièce' },
            isDefault: true,
            isDiscontinued: false,
            allergens: [],
          },
        ],
      }),
    );
    const plan = planPublication(current, published);
    const drifted = plan.entries.filter((e) => e.status === 'drifted');
    expect(drifted).toHaveLength(2);
    expect(drifted[0]?.diffs.some((d) => d.field === 'Déclinaisons')).toBe(true);
  });

  it('marque « à retirer » une fiche publiée qui ne se projette plus', () => {
    const published = Object.fromEntries(project(product()));
    const plan = planPublication(new Map(), published);
    expect(plan.counts['to-remove']).toBe(2);
    expect(plan.entries.every((e) => e.status === 'to-remove')).toBe(true);
  });

  it('trie les actions avant les fiches à jour', () => {
    const current = project(product());
    // Une seule des deux fiches est publiée à l'identique → l'autre est « nouvelle ».
    const [firstHandle, firstFiche] = [...current][0]!;
    const plan = planPublication(current, { [firstHandle]: firstFiche });
    expect(plan.entries[0]?.status).toBe('new');
    expect(plan.entries.at(-1)?.status).toBe('up-to-date');
  });
});
