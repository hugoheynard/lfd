import { describe, expect, it } from 'vitest';

import { type DeliveryVatOutcome, deliveryVatExamples } from '../delivery-vat-examples';

/**
 * Les fiches de la page « TVA de la livraison » : 100 € HT de produits,
 * 10 € HT de livraison. Les chiffres attendus ont été calculés à la main
 * (2026-10-08) ; ils doivent tomber sur ceux de `ventilateVat`, et chaque
 * TVA doit se refaire à la main depuis sa base — c'est ce que le comptable
 * fera en lisant la page.
 */
describe('les fiches de la TVA de la livraison', () => {
  const [allReduced, allNormal, mixed] = deliveryVatExamples();

  it('tout à 5,5 % : la livraison à 20 % au taux normal, à 5,5 % au prorata', () => {
    expect(allReduced?.standard.rows).toEqual([
      { rate: 5.5, goodsHtCents: 10_000, deliveryHtCents: 0, baseHtCents: 10_000, vatCents: 550 },
      { rate: 20, goodsHtCents: 0, deliveryHtCents: 1_000, baseHtCents: 1_000, vatCents: 200 },
    ]);
    expect(allReduced?.standard.totalCents).toBe(11_750);
    expect(allReduced?.followsGoods.rows).toEqual([
      {
        rate: 5.5,
        goodsHtCents: 10_000,
        deliveryHtCents: 1_000,
        baseHtCents: 11_000,
        vatCents: 605,
      },
    ]);
    expect(allReduced?.followsGoods.totalCents).toBe(11_605);
    expect(allReduced?.gapCents).toBe(145);
  });

  it('tout à 20 % : aucun écart, le port suit déjà 20 %', () => {
    expect(allNormal?.standard.totalCents).toBe(13_200);
    expect(allNormal?.followsGoods.totalCents).toBe(13_200);
    expect(allNormal?.gapCents).toBe(0);
  });

  it('le panier mêlé : au prorata, 6 € de livraison à 5,5 % et 4 € à 20 %', () => {
    expect(mixed?.followsGoods.rows).toEqual([
      { rate: 5.5, goodsHtCents: 6_000, deliveryHtCents: 600, baseHtCents: 6_600, vatCents: 363 },
      { rate: 20, goodsHtCents: 4_000, deliveryHtCents: 400, baseHtCents: 4_400, vatCents: 880 },
    ]);
    expect(mixed?.gapCents).toBe(87);
  });

  it('chaque TVA se refait à la main : base × taux, arrondi au centime', () => {
    const outcomes: DeliveryVatOutcome[] = deliveryVatExamples().flatMap((example) => [
      example.standard,
      example.followsGoods,
    ]);
    for (const outcome of outcomes) {
      for (const row of outcome.rows) {
        expect(row.vatCents).toBe(Math.round((row.baseHtCents * row.rate) / 100));
      }
      expect(outcome.totalCents).toBe(outcome.totalHtCents + outcome.vatCents);
    }
  });
});
