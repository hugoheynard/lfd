import type { ClientSheet, ClientSheetLine } from '@lfd/contracts';

import { renderOrderSheetText } from '../order-sheet-text';

/**
 * Le bon texte d'une commande de particulier composée en TTC (plan
 * `documentation/pricing/plan-centime-particuliers.md`, lot C3) : le format du
 * ticket. Le bon d'un pro (`line_ht`, sans `ttcTerms`) ne bouge pas : figé ici.
 */

const COMMON = {
  orderId: 'order_1',
  reference: 'CMD-4812',
  placedAt: '2026-09-07T06:00:00.000Z',
  requestedFor: '2026-09-08',
  fulfillment: {
    method: 'pickup' as const,
    address: null,
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: '',
  issuedAt: '2026-09-07T06:00:00.000Z',
  revision: 0,
};

/** Banana bread 21,00 € à 5,5 % (HT 19,90 après extraction). */
const BANANA: ClientSheetLine = {
  sku: 'BAN',
  productName: 'Banana bread',
  quantity: 1,
  unitPriceMillicents: 1_990_521,
  vatRate: 5.5,
  lineTotalCents: 1_990,
  unitPriceTtcCents: 2_100,
  lineTotalTtcCents: 2_100,
  priceLabels: [],
};

/** Deux jus à 3,00 € à 20 % (HT 5,00). */
const JUICE: ClientSheetLine = {
  sku: 'JUS',
  productName: 'Jus',
  quantity: 2,
  unitPriceMillicents: 250_000,
  vatRate: 20,
  lineTotalCents: 500,
  unitPriceTtcCents: 300,
  lineTotalTtcCents: 600,
  priceLabels: [],
};

function sheet(
  lines: readonly ClientSheetLine[],
  money: Partial<ClientSheet['money']>,
): ClientSheet {
  return {
    ...COMMON,
    audience: 'client',
    lines,
    money: {
      subtotalCents: 2_490,
      discountCents: 0,
      voucherDiscountCents: 0,
      discountAdjustment: null,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 210,
      vatShares: [
        { rate: 5.5, amountCents: 110 },
        { rate: 20, amountCents: 100 },
      ],
      totalCents: 2_700,
      currency: 'EUR',
      settlement: 'paid',
      ...money,
    },
  };
}

const NO_GESTURE = { discountCents: 0, voucherCents: 0, deliveryFeeCents: 0 };

/** « 12,34 € » → 1234, signe compris. */
function cents(text: string): number {
  const digits = Number(text.replace(/[^\d,]/gu, '').replace(',', '.'));
  return Math.round(digits * 100) * (text.includes('−') ? -1 : 1);
}

function amountOn(text: string, label: string): number {
  const line = text.split('\n').find((candidate) => candidate.trimStart().startsWith(label));
  return cents(line?.slice(label.length + 2) ?? '');
}

/** La part figée de chaque taux sans geste : 21,00 à 5,5 % et 6,00 à 20 %. */
const BY_RATE = [
  { rate: 5.5, htCents: 1_990, vatCents: 110, ttcCents: 2_100 },
  { rate: 20, htCents: 500, vatCents: 100, ttcCents: 600 },
];

describe('le bon texte au format du ticket (commande exact_ht)', () => {
  it('lignes en TTC, total, et le récapitulatif par taux recopié', () => {
    const text = renderOrderSheetText(
      sheet([BANANA, JUICE], { ttcTerms: NO_GESTURE, ttcByRate: BY_RATE }),
    );

    expect(text).toContain('DÉCOMPTE (TTC)');
    expect(text).not.toContain('Sous-total HT');
    expect(text).toMatch(/Banana bread \(BAN\)\s+21,00\s€\s+21,00\s€/u);
    expect(text).toMatch(/Jus \(JUS\)\s+3,00\s€\s+6,00\s€/u);
    expect(amountOn(text, 'Total TTC')).toBe(2_700);
    expect(text).toMatch(/5,5\s%\s+19,90\s€\s+1,10\s€\s+21,00\s€/u);
    expect(text).toMatch(/20\s%\s+5,00\s€\s+1,00\s€\s+6,00\s€/u);
  });

  it('régression : Σ lignes TTC − remises + port = total affiché, et le récap somme vers lui', () => {
    // −10 % de 27,00 = 2,70, découpé 2,10 / 0,60 par taux à la passation.
    const byRate = [
      { rate: 5.5, htCents: 1_791, vatCents: 99, ttcCents: 1_890 },
      { rate: 20, htCents: 450, vatCents: 90, ttcCents: 540 },
    ];
    const text = renderOrderSheetText(
      sheet([BANANA, JUICE], {
        ttcTerms: { discountCents: 270, voucherCents: 0, deliveryFeeCents: 0 },
        ttcByRate: byRate,
        totalCents: 2_430,
        vatCents: 189,
      }),
    );

    expect(amountOn(text, 'Articles') + amountOn(text, 'Remise')).toBe(amountOn(text, 'Total TTC'));
    expect(amountOn(text, 'Total TTC')).toBe(2_430);
    expect(text).toMatch(/5,5\s%\s+17,91\s€\s+0,99\s€\s+18,90\s€/u);
    expect(text).toMatch(/20\s%\s+4,50\s€\s+0,90\s€\s+5,40\s€/u);
    expect(byRate.reduce((sum, part) => sum + part.ttcCents, 0)).toBe(2_430);
  });

  it("sans part figée (commande exact_ht d'avant la colonne) : le décompte HT, rien de reconstitué", () => {
    const text = renderOrderSheetText(sheet([BANANA, JUICE], { ttcTerms: NO_GESTURE }));

    expect(text).toContain('Sous-total HT');
    expect(text).not.toContain('DÉCOMPTE (TTC)');
  });
});

describe("le bon d'un pro (line_ht) ne change pas", () => {
  it('sans ttcTerms : le décompte HT, mot pour mot', () => {
    const pro = sheet([{ ...JUICE, unitPriceTtcCents: null, lineTotalTtcCents: null }], {
      subtotalCents: 500,
      vatCents: 100,
      vatShares: [{ rate: 20, amountCents: 100 }],
      totalCents: 600,
    });

    // Les espaces insécables du formateur ramenés à l'espace : on fige les mots et l'ordre.
    const text = renderOrderSheetText(pro).replace(new RegExp('[\\u00a0\\u202f]', 'gu'), ' ');
    const body = text.slice(text.indexOf('ARTICLES'), text.indexOf('Arrêté le'));

    expect(body).toBe(
      [
        'ARTICLES',
        '    2 × Jus (JUS)                               2,50 €      5,00 €',
        '',
        'Total articles : 2',
        '',
        'DÉCOMPTE',
        '  Sous-total HT                     5,00 €',
        '  TVA                               1,00 €',
        '  Total TTC                         6,00 €',
        '',
        '',
      ].join('\n'),
    );
  });

  it('même avec des TTC de ligne, sans ttcTerms la feuille reste en HT', () => {
    const text = renderOrderSheetText(sheet([BANANA, JUICE], {}));

    expect(text).toContain('Sous-total HT');
    expect(text).not.toContain('DÉCOMPTE (TTC)');
  });
});
