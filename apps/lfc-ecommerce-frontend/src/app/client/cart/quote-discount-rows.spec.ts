import { quoteDiscountRows } from './quote-discount-rows';

/** Plan des promotions, § 18.6, lot M7 : le devis porte une ligne par remise cumulée. */
describe('quoteDiscountRows', () => {
  const unnamed = (value: string): string => `Remise ${value}`;

  it('une remise au plus : LA ligne d’hier, au caractère près', () => {
    expect(
      quoteDiscountRows({ discountCents: 120 }, 'Remise retrait Labo −10 %', unnamed, 'fr'),
    ).toEqual([{ label: 'Remise retrait Labo −10 %', cents: 120 }]);
    expect(quoteDiscountRows({ discountCents: 0 }, null, unnamed, 'fr')).toEqual([]);
  });

  it('plusieurs remises : une ligne par remise, libellé figé dans la langue de l’écran', () => {
    const totals = {
      discountCents: 300,
      discounts: [
        {
          label: { fr: 'Retrait', en: 'Pickup', it: 'Ritiro' },
          adjustment: { mode: 'percent' as const, bp: 1_000 },
          amountCents: 200,
          amountTtcCents: null,
        },
        {
          adjustment: { mode: 'amount' as const, cents: 100 },
          amountCents: 100,
          amountTtcCents: null,
        },
      ],
    };
    const rows = quoteDiscountRows(totals, null, unnamed, 'en');
    expect(rows.map((row) => row.label)).toEqual(['Pickup', expect.stringContaining('Remise')]);
    expect(rows.reduce((sum, row) => sum + row.cents, 0)).toBe(totals.discountCents);
  });
});
