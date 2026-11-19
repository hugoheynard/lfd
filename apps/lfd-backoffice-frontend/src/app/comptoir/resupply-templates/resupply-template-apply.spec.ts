import { describe, expect, it } from 'vitest';

import { filledFromTemplate, skippedNotice, splitTemplateLines } from './resupply-template-apply';
import { ARTICLES, baseMatin } from './resupply-template.testing';

describe('splitTemplateLines — ce qui s’applique au catalogue lu', () => {
  it('écarte les lignes marquées, celles hors du catalogue et celles d’une autre unité', () => {
    const template = baseMatin();
    const { applicable, skipped } = splitTemplateLines(
      {
        ...template,
        lines: [
          ...template.lines,
          { sku: 'GONE', quantity: 1, saleUnit: 'piece', articleName: 'X', issue: null },
          { sku: 'PAC', quantity: 300, saleUnit: 'weight', articleName: 'PAC', issue: null },
        ],
      },
      ARTICLES,
    );
    expect(applicable.map((line) => line.sku)).toEqual(['CRO']);
    expect(skipped).toEqual([
      { sku: 'OLD', reason: 'withdrawn' },
      { sku: 'BAG', reason: 'sale_unit_changed' },
      { sku: 'GONE', reason: 'withdrawn' },
      { sku: 'PAC', reason: 'sale_unit_changed' },
    ]);
  });
});

describe('filledFromTemplate — la composition du fournil remplie par un modèle', () => {
  const current = new Map([
    ['CRO', 3],
    ['PAC', 4],
  ]);

  it('« Remplacer » pose le modèle et retire le reste', () => {
    const filled = filledFromTemplate(current, baseMatin(), 'replace', ARTICLES);
    expect([...filled.quantities]).toEqual([['CRO', 12]]);
    expect(filled.skipped.map((line) => line.sku)).toEqual(['OLD', 'BAG']);
  });

  it('« Ajouter » additionne les quantités du modèle à la saisie', () => {
    const filled = filledFromTemplate(current, baseMatin(), 'add', ARTICLES);
    expect(Object.fromEntries(filled.quantities)).toEqual({ CRO: 15, PAC: 4 });
  });

  it('ne touche pas la composition reçue', () => {
    filledFromTemplate(current, baseMatin(), 'add', ARTICLES);
    expect(current.get('CRO')).toBe(3);
  });
});

describe('skippedNotice — l’avis des lignes écartées', () => {
  it('ne dit rien quand rien n’est écarté', () => {
    expect(skippedNotice([], ARTICLES, baseMatin())).toBeNull();
  });

  it('nomme chaque article par le catalogue, sinon par le modèle, sinon par son SKU', () => {
    expect(
      skippedNotice(
        [
          { sku: 'BAG', reason: 'sale_unit_changed' },
          { sku: 'OLD', reason: 'withdrawn' },
          { sku: 'ZZZ', reason: 'withdrawn' },
        ],
        ARTICLES,
        baseMatin(),
      ),
    ).toBe(
      '3 articles écartés : Baguette (unité de vente changée depuis), OLD (article retiré du réassort), ZZZ (article retiré du réassort).',
    );
  });

  it('accorde au singulier', () => {
    expect(skippedNotice([{ sku: 'CRO', reason: 'withdrawn' }], ARTICLES, null)).toBe(
      '1 article écarté : Croissant (article retiré du réassort).',
    );
  });
});
