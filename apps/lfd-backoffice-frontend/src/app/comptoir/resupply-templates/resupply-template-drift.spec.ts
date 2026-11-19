import { describe, expect, it } from 'vitest';

import { type DriftLine, templateDrift } from './resupply-template-drift';

const NAMES: Record<string, string> = {
  CRO: 'Croissant',
  TRA: 'Tradition',
  PAC: 'Pain au chocolat',
  SAU: 'Saumon',
  BAG: 'Baguette',
};
const labelOf = (sku: string): string => NAMES[sku] ?? sku;

const piece = (sku: string, quantity: number): DriftLine => ({ sku, quantity, saleUnit: 'piece' });

describe('templateDrift — l’écart entre le modèle et la demande', () => {
  it('ne dit rien quand la demande est le modèle', () => {
    expect(templateDrift([piece('CRO', 12)], [piece('CRO', 12)], labelOf)).toBeNull();
  });

  it('nomme les quantités changées, puis compte les ajouts et les retraits', () => {
    const template = [piece('CRO', 10), piece('TRA', 5), piece('BAG', 4)];
    const current = [piece('CRO', 12), piece('TRA', 4), piece('PAC', 6)];
    expect(templateDrift(template, current, labelOf)).toBe(
      '+2 Croissant, −1 Tradition, 1 article ajouté, 1 retiré',
    );
  });

  it('accorde les comptes au pluriel', () => {
    expect(
      templateDrift(
        [piece('CRO', 1)],
        [piece('CRO', 1), piece('PAC', 2), piece('TRA', 3)],
        labelOf,
      ),
    ).toBe('2 articles ajoutés');
    expect(templateDrift([piece('CRO', 1), piece('PAC', 2)], [], labelOf)).toBe(
      '2 articles retirés',
    );
  });

  it('dit « article » sur le seul compte des retraits', () => {
    expect(templateDrift([piece('CRO', 1)], [], labelOf)).toBe('1 article retiré');
  });

  it("suit l'unité : un écart au poids se dit en grammes ou en kilos", () => {
    const template: DriftLine[] = [{ sku: 'SAU', quantity: 500, saleUnit: 'weight' }];
    expect(
      templateDrift(template, [{ sku: 'SAU', quantity: 750, saleUnit: 'weight' }], labelOf),
    ).toBe('+250 g Saumon');
    expect(
      templateDrift(template, [{ sku: 'SAU', quantity: 2000, saleUnit: 'weight' }], labelOf),
    ).toBe('+1,5 kg Saumon');
  });
});
