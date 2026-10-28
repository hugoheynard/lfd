import type { CatalogFamilyView, CatalogItemView, AtelierSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { productionRecap, resupplyPieces, totalPieces } from '../production-recap';

function sheet(reference: string, lines: [string, string, number][]): AtelierSheet {
  return {
    orderId: `ord_${reference}`,
    reference,
    audience: 'atelier',
    customer: { tradeName: 'Café des Halles', legalName: 'Café des Halles SAS' },
    placedAt: '2026-09-07T04:00:00.000Z',
    requestedFor: '2026-09-08',
    fulfillment: {
      method: 'pickup',
      address: null,
      pickupLabel: null,
      window: null,
      contact: null,
      signatureRequired: false,
    },
    note: '',
    origin: 'self_service',
    issuedAt: '2026-09-07T04:00:00.000Z',
    revision: 0,
    lines: lines.map(([sku, productName, quantity]) => ({ sku, productName, quantity })),
  };
}

/** Des familles opaques, telles que le référentiel les livre : un id, un nom, un rang. */
const VIENNOISERIES: CatalogFamilyView = { id: 'fam_01J9V1', name: 'Viennoiseries', position: 1 };
const PAINS: CatalogFamilyView = { id: 'fam_01J9P2', name: 'Pains', position: 2 };

function item(sku: string, family: CatalogFamilyView | null): CatalogItemView {
  return { sku, name: sku, unitPriceMillicents: 100, vatRate: 5.5, family, category: null };
}

const CATALOGUE: readonly CatalogItemView[] = [
  item('CRO', VIENNOISERIES),
  item('PAC', VIENNOISERIES),
  item('BAG', PAINS),
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

  it('groupe par rayon, dans l’ordre du référentiel et non par poids', () => {
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

  /**
   * 🔴 Une lecture de catalogue en échec rangeait TOUT sous « Hors catalogue »,
   * c'est-à-dire affirmait que le fournil fabrique des produits retirés de la
   * vente — jusque sur le papier qui part au fournil. Un mensonge plausible est
   * le pire : rien ne disait qu'il venait d'une panne (corrigé le 2026-09-11).
   */
  it("ne dit pas « hors catalogue » quand le catalogue n'a pas pu être lu", () => {
    const recap = productionRecap([sheet('C-1', [['CRO', 'Croissant', 10]])], [], false);

    expect(recap.map((group) => group.label)).toEqual(['Rayon inconnu']);
    expect(totalPieces(recap)).toBe(10);
  });

  it('rend une liste vide pour un lot vide', () => {
    expect(productionRecap([], CATALOGUE)).toEqual([]);
    expect(totalPieces([])).toBe(0);
  });

  /** R3d-bis (Hugo, 2026-10-21) : la fiche de poste compte les réassorts. */
  it('additionne les réassorts dans le total du produit et du rayon, la part à côté', () => {
    const recap = productionRecap([sheet('C-1', [['CRO', 'Croissant', 24]])], CATALOGUE, true, [
      {
        resupplyId: 'r-1',
        siteId: 'site-v',
        siteLabel: 'Village',
        name: null,
        servedByTransfer: true,
        lines: [
          { sku: 'CRO', productName: 'Croissant', quantity: 18 },
          { sku: 'PAC', productName: 'Pain au chocolat', quantity: 6 },
        ],
      },
    ]);

    expect(recap[0]).toMatchObject({ label: 'Viennoiseries', quantity: 48, resupplyQuantity: 24 });
    expect(recap[0]?.lines).toEqual([
      {
        sku: 'CRO',
        productName: 'Croissant',
        quantity: 42,
        saleUnit: 'piece',
        label: '42',
        orderCount: 1,
        resupplyQuantity: 18,
      },
      {
        sku: 'PAC',
        productName: 'Pain au chocolat',
        quantity: 6,
        saleUnit: 'piece',
        label: '6',
        orderCount: 0,
        resupplyQuantity: 6,
      },
    ]);
    expect(totalPieces(recap)).toBe(48);
    expect(resupplyPieces(recap)).toBe(24);
  });
});

/** P6 de `vente-au-poids.md` : la fiche de poste écrit des kilos, et compte une pièce par commande. */
describe('le récapitulatif de production, au poids', () => {
  function weighed(reference: string, grams: number, croissants = 0): AtelierSheet {
    const base = sheet(reference, croissants > 0 ? [['CRO', 'Croissant', croissants]] : []);
    return {
      ...base,
      lines: [
        ...base.lines,
        { sku: 'SAU', productName: 'Saumon gravlax', quantity: grams, saleUnit: 'weight' },
      ],
    };
  }

  it('additionne les grammes et dit « 1,75 kg »', () => {
    const recap = productionRecap([weighed('C-1', 1250, 12), weighed('C-2', 500)], CATALOGUE);
    const salmon = recap.flatMap((group) => group.lines).find((line) => line.sku === 'SAU');

    expect(salmon).toMatchObject({ quantity: 1750, saleUnit: 'weight', label: '1,75 kg' });
  });

  it('compte 12 croissants et deux commandes au poids : 14 pièces, jamais 1 762', () => {
    const recap = productionRecap([weighed('C-1', 1250, 12), weighed('C-2', 500)], CATALOGUE);

    expect(totalPieces(recap)).toBe(14);
  });

  it('une ligne sans unité reste une ligne à la pièce', () => {
    const recap = productionRecap([sheet('C-1', [['CRO', 'Croissant', 40]])], CATALOGUE);

    expect(recap[0]?.lines[0]).toMatchObject({ saleUnit: 'piece', label: '40' });
  });
});
