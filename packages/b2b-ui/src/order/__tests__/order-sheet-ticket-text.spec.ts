import type { ClientSheet, ClientSheetLine } from '@lfd/contracts';

import { renderOrderSheetText } from '../order-sheet-text';
import { readableRateRows } from '../order-sheet-ticket-text';

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

describe('le bon texte au format du ticket (commande exact_ht)', () => {
  it('lignes en TTC, total, et un récapitulatif par taux qui somme vers le total', () => {
    const text = renderOrderSheetText(sheet([BANANA, JUICE], { ttcTerms: NO_GESTURE }));

    expect(text).toContain('DÉCOMPTE (TTC)');
    expect(text).not.toContain('Sous-total HT');
    expect(text).toMatch(/Banana bread \(BAN\)\s+21,00\s€\s+21,00\s€/u);
    expect(text).toMatch(/Jus \(JUS\)\s+3,00\s€\s+6,00\s€/u);
    expect(amountOn(text, 'Total TTC')).toBe(2_700);
    expect(text).toMatch(/5,5\s%\s+19,90\s€\s+1,10\s€\s+21,00\s€/u);
    expect(text).toMatch(/20\s%\s+5,00\s€\s+1,00\s€\s+6,00\s€/u);
  });

  it('régression : Σ lignes TTC − remises + port = total affiché', () => {
    const lines = [{ ...BANANA, quantity: 1 }];
    const ttcTerms = { discountCents: 210, voucherCents: 500, deliveryFeeCents: 0 };
    const text = renderOrderSheetText(
      sheet(lines, {
        ttcTerms,
        totalCents: 1_390,
        vatCents: 73,
        vatShares: [{ rate: 5.5, amountCents: 73 }],
      }),
    );

    const shown =
      amountOn(text, 'Articles') + amountOn(text, 'Remise') + amountOn(text, 'Bon fidélité');
    expect(shown).toBe(amountOn(text, 'Total TTC'));
    expect(amountOn(text, 'Total TTC')).toBe(1_390);
    // Un seul taux : il porte tout le total.
    expect(text).toMatch(/5,5\s%\s+13,17\s€\s+0,73\s€\s+13,90\s€/u);
  });

  it('des gestes sur deux taux : la TVA de chaque taux et le HT global, jamais une base reconstituée', () => {
    const text = renderOrderSheetText(
      sheet([BANANA, JUICE], {
        ttcTerms: { discountCents: 270, voucherCents: 0, deliveryFeeCents: 0 },
        totalCents: 2_430,
        vatCents: 189,
        vatShares: [
          { rate: 5.5, amountCents: 99 },
          { rate: 20, amountCents: 90 },
        ],
      }),
    );

    expect(text).not.toMatch(/Taux\s+HT/u);
    expect(text).toMatch(new RegExp('dont TVA 5,5\\s%\\s+0,99\\s€', 'u'));
    expect(amountOn(text, 'Total HT')).toBe(2_430 - 189);
  });
});

describe('readableRateRows — le récapitulatif somme vers le total', () => {
  it('sans geste, Σ TTC par taux = total, et HT + TVA = TTC sur chaque taux', () => {
    const ticket = [BANANA, JUICE].map((line) => ({
      line,
      totalTtcCents: line.lineTotalTtcCents ?? 0,
    }));
    const rows =
      readableRateRows(ticket, NO_GESTURE, {
        vatShares: [
          { rate: 5.5, amountCents: 110 },
          { rate: 20, amountCents: 100 },
        ],
        vatCents: 210,
        totalCents: 2_700,
      }) ?? [];

    expect(rows.reduce((sum, row) => sum + row.ttcCents, 0)).toBe(2_700);
    expect(rows.every((row) => row.htCents + row.vatCents === row.ttcCents)).toBe(true);
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
