import type { BinTypeView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  capacityIndex,
  cellKey,
  coldGapLabel,
  coldWithoutIsotherm,
  missingLabel,
  readCell,
  skusWithoutCapacity,
  visibleProducts,
} from './bin-capacities';

const PRODUCTS = [
  { sku: 'CRO-01', name: 'Croissant', requiresCold: false },
  { sku: 'ECL-02', name: 'Éclair café', requiresCold: true },
  { sku: 'PAI-03', name: 'Pain de campagne', requiresCold: false },
];

function type(id: string, isotherm: boolean): BinTypeView {
  return {
    id,
    name: `Bac ${id}`,
    outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
    inner: { lengthMm: 560, widthMm: 360, heightMm: 270 },
    innerVolumeLiters: 54,
    isotherm,
    maxStack: 5,
    divisible: false,
    archivedAt: null,
  };
}

const INDEX = capacityIndex([
  { binTypeId: 'M', sku: 'CRO-01', units: 40 },
  { binTypeId: 'S', sku: 'ECL-02', units: 12 },
  // Un type archivé n'est pas dans les colonnes : sa case ne compte pas.
  { binTypeId: 'OLD', sku: 'PAI-03', units: 6 },
]);

describe('skusWithoutCapacity', () => {
  it('signale le produit sans contenance pour AUCUN type proposé', () => {
    expect([...skusWithoutCapacity(PRODUCTS, ['M', 'S'], INDEX)]).toEqual(['PAI-03']);
  });

  it('sans aucun type, tous les produits sont sans contenance', () => {
    expect(skusWithoutCapacity(PRODUCTS, [], INDEX).size).toBe(3);
  });
});

describe('coldWithoutIsotherm', () => {
  it('🔴 signale le produit froid qui n’a de contenance que dans des bacs secs', () => {
    expect([...coldWithoutIsotherm(PRODUCTS, [type('M', false), type('S', false)], INDEX)]).toEqual(
      ['ECL-02'],
    );
  });

  it('se tait dès qu’un bac isotherme a sa contenance', () => {
    expect(coldWithoutIsotherm(PRODUCTS, [type('M', false), type('S', true)], INDEX).size).toBe(0);
  });

  it('laisse aux manques le produit froid sans aucune contenance', () => {
    const cold = [{ sku: 'GLA-04', name: 'Glace', requiresCold: true }];
    expect(coldWithoutIsotherm(cold, [type('M', false)], INDEX).size).toBe(0);
  });

  it('se dit au singulier et au pluriel', () => {
    expect(coldGapLabel(0)).toBeNull();
    expect(coldGapLabel(1)).toBe('1 produit froid sans bac isotherme');
    expect(coldGapLabel(2)).toBe('2 produits froids sans bac isotherme');
  });
});

describe('visibleProducts', () => {
  const missing = new Set(['PAI-03', 'ECL-02']);

  it('cherche sans accents ni casse, sur le nom ou le SKU', () => {
    expect(visibleProducts(PRODUCTS, 'ECLAIR', false, missing).map((p) => p.sku)).toEqual([
      'ECL-02',
    ]);
    expect(visibleProducts(PRODUCTS, ' cro-0 ', false, missing).map((p) => p.sku)).toEqual([
      'CRO-01',
    ]);
  });

  it('croise la recherche et le filtre « sans contenance »', () => {
    expect(visibleProducts(PRODUCTS, '', true, missing).map((p) => p.sku)).toEqual([
      'ECL-02',
      'PAI-03',
    ]);
    expect(visibleProducts(PRODUCTS, 'pain', true, missing).map((p) => p.sku)).toEqual(['PAI-03']);
  });
});

describe('readCell', () => {
  it('une case vidée retire la contenance', () => {
    expect(readCell(null)).toEqual({ ok: true, units: null });
  });

  it('prend un entier dans les bornes', () => {
    expect(readCell(24)).toEqual({ ok: true, units: 24 });
  });

  it('🔴 refuse une fraction au lieu de l’arrondir', () => {
    expect(readCell(2.5)).toEqual({
      ok: false,
      issue: 'Une contenance est un nombre entier d’unités.',
    });
  });

  it('refuse zéro et l’excès, en disant comment retirer', () => {
    for (const units of [0, 10_001]) {
      const reading = readCell(units);
      expect(reading.ok).toBe(false);
      expect(reading.ok ? '' : reading.issue).toContain('Videz la case pour la retirer.');
    }
  });
});

describe('les clés et les comptes', () => {
  it('une clé de case ne confond pas deux paires', () => {
    expect(cellKey('a', 'bc')).not.toBe(cellKey('ab', 'c'));
  });

  it('dit le nombre de produits sans contenance, rien quand tout est renseigné', () => {
    expect(missingLabel(0)).toBeNull();
    expect(missingLabel(1)).toBe('1 produit sans aucune contenance');
    expect(missingLabel(4)).toBe('4 produits sans aucune contenance');
  });
});
