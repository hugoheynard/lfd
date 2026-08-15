import type { CatalogItemView, ProductionSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { productionRecap, totalPieces } from '../production-recap';

function sheet(orderNumber: string, lines: [string, string, number][]): ProductionSheet {
  return {
    orderId: `ord_${orderNumber}`,
    orderNumber,
    tradeName: 'Café des Halles',
    legalName: 'Café des Halles SAS',
    fulfillmentMethod: 'pickup',
    pickupLabel: null,
    pickupAddress: null,
    deliveryAddress: null,
    deliveryContact: null,
    window: null,
    signatureRequired: false,
    note: '',
    origin: 'self_service',
    lines: lines.map(([sku, productName, quantity]) => ({ sku, productName, quantity })),
  };
}

function item(sku: string, category: CatalogItemView['category']): CatalogItemView {
  return { sku, name: sku, unitPriceCents: 100, vatRate: 5.5, category };
}

const CATALOGUE: readonly CatalogItemView[] = [
  item('CRO', 'viennoiserie'),
  item('PAC', 'viennoiserie'),
  item('BAG', 'pain'),
];

describe('le récapitulatif de production', () => {
  it('additionne un même produit à travers les commandes', () => {
    const recap = productionRecap(
      [sheet('C-1', [['CRO', 'Croissant', 40]]), sheet('C-2', [['CRO', 'Croissant', 200]])],
      CATALOGUE,
    );
    const croissant = recap[0]?.lines[0];

    expect(croissant?.quantity).toBe(240);
    // Sur combien de commandes ça se répartit : 240 en 2 fois ≠ 240 en 40.
    expect(croissant?.orderCount).toBe(2);
  });

  it('groupe par rayon, dans l’ordre de la vitrine et non par poids', () => {
    // La baguette pèse plus que le croissant, mais « Pains » vient après
    // « Viennoiseries » au catalogue : c'est l'ordre que l'équipe connaît.
    const recap = productionRecap(
      [sheet('C-1', [['BAG', 'Baguette', 500]]), sheet('C-2', [['CRO', 'Croissant', 10]])],
      CATALOGUE,
    );

    expect(recap.map((group) => group.label)).toEqual(['Viennoiseries', 'Pains']);
  });

  it('trie par quantité décroissante à l’intérieur d’un rayon', () => {
    const recap = productionRecap(
      [
        sheet('C-1', [
          ['CRO', 'Croissant', 12],
          ['PAC', 'Pain au chocolat', 90],
        ]),
      ],
      CATALOGUE,
    );

    expect(recap[0]?.lines.map((line) => line.productName)).toEqual([
      'Pain au chocolat',
      'Croissant',
    ]);
  });

  it('range à part, en fin de liste, ce que le catalogue ne connaît plus', () => {
    // Un produit retiré du catalogue reste à fabriquer : il a été vendu. Le
    // laisser tomber du récapitulatif ferait manquer une fournée.
    const recap = productionRecap(
      [
        sheet('C-1', [
          ['CRO', 'Croissant', 10],
          ['ZZZ', 'Galette des rois', 4],
        ]),
      ],
      CATALOGUE,
    );

    expect(recap.map((group) => group.label)).toEqual(['Viennoiseries', 'Hors catalogue']);
    expect(recap.at(-1)?.lines[0]?.productName).toBe('Galette des rois');
  });

  it('somme le rayon et le lot entier', () => {
    const recap = productionRecap(
      [
        sheet('C-1', [
          ['CRO', 'Croissant', 10],
          ['BAG', 'Baguette', 5],
        ]),
      ],
      CATALOGUE,
    );

    expect(recap[0]?.quantity).toBe(10);
    expect(totalPieces(recap)).toBe(15);
  });

  it('rend une liste vide pour un lot vide', () => {
    expect(productionRecap([], CATALOGUE)).toEqual([]);
    expect(totalPieces([])).toBe(0);
  });
});
