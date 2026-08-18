import { describe, expect, it } from 'vitest';

import { centsOf, eurosField, quantityOf, toPayloadLines, type DraftLine } from '../gabarit-draft';

const line = (tiers: { minQuantity: string; unitPrice: string }[]): DraftLine => ({
  sku: 'PAI-001',
  productName: 'Baguette',
  catalogPriceCents: 100,
  tiers,
});

describe('centsOf', () => {
  it('accepte la virgule comme le point', () => {
    expect(centsOf('0,80')).toBe(80);
    expect(centsOf('0.80')).toBe(80);
  });

  it('accepte zéro — un article offert est un prix réel', () => {
    expect(centsOf('0')).toBe(0);
  });

  it('ne rend rien pour une saisie illisible ou négative', () => {
    expect(centsOf('')).toBeNull();
    expect(centsOf('abc')).toBeNull();
    expect(centsOf('-1')).toBeNull();
  });
});

describe('quantityOf', () => {
  it('refuse zéro et le négatif — un palier part d’au moins une pièce', () => {
    expect(quantityOf('0')).toBeNull();
    expect(quantityOf('-5')).toBeNull();
    expect(quantityOf('10000')).toBe(10_000);
  });
});

describe('eurosField', () => {
  it('préremplit à la française', () => {
    expect(eurosField(80)).toBe('0,80');
    expect(eurosField(10_000)).toBe('100,00');
  });
});

describe('toPayloadLines', () => {
  it('convertit une grille lisible', () => {
    expect(
      toPayloadLines([
        line([
          { minQuantity: '1', unitPrice: '0,85' },
          { minQuantity: '10000', unitPrice: '0,78' },
        ]),
      ]),
    ).toEqual([
      {
        sku: 'PAI-001',
        tiers: [
          { minQuantity: 1, unitPriceCents: 85 },
          { minQuantity: 10_000, unitPriceCents: 78 },
        ],
      },
    ]);
  });

  /** Un palier vide est un ajout qu'on n'a pas rempli : il s'oublie sans bloquer. */
  it('oublie un palier entièrement vide', () => {
    expect(
      toPayloadLines([
        line([
          { minQuantity: '1', unitPrice: '0,85' },
          { minQuantity: '', unitPrice: '' },
        ]),
      ]),
    ).toEqual([{ sku: 'PAI-001', tiers: [{ minQuantity: 1, unitPriceCents: 85 }] }]);
  });

  /**
   * **Le refus qui compte.** Un palier à moitié rempli est une faute de frappe,
   * pas un renoncement : le laisser partir à zéro poserait un prix que personne
   * n'a voulu, et zéro est un prix réel dans ce modèle.
   */
  it('refuse toute la grille si un palier est à moitié rempli', () => {
    expect(toPayloadLines([line([{ minQuantity: '1', unitPrice: '' }])])).toBeNull();
    expect(toPayloadLines([line([{ minQuantity: '', unitPrice: '0,85' }])])).toBeNull();
  });

  it('écarte une ligne sans aucun palier plutôt que de bloquer le reste', () => {
    expect(
      toPayloadLines([
        line([{ minQuantity: '', unitPrice: '' }]),
        { ...line([{ minQuantity: '1', unitPrice: '0,80' }]), sku: 'PAI-002' },
      ]),
    ).toEqual([{ sku: 'PAI-002', tiers: [{ minQuantity: 1, unitPriceCents: 80 }] }]);
  });

  it('ne rend rien quand plus aucune ligne ne porte de prix', () => {
    expect(toPayloadLines([line([{ minQuantity: '', unitPrice: '' }])])).toBeNull();
  });
});
