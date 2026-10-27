import { htMillicentsOf } from "../tax.js";
import { ventilateVatExact, type ExactVatLine } from "../vat-exact.js";
import type { VatVentilation } from "../vat.js";

/** Le HT en millicentimes d'une étiquette TTC — la chaîne de la vitrine. */
function label(ttcCents: number, vatRate: number, quantity = 1): ExactVatLine {
  return { unitMillicents: htMillicentsOf(ttcCents, vatRate) ?? 0, quantity, vatRate };
}

function plain(lines: readonly ExactVatLine[]): VatVentilation {
  return ventilateVatExact({ lines, discountCents: 0, extras: [] });
}

/** L'en-tête de la commande doit se recomposer : HT net + extras + TVA = TTC. */
function expectRecomposes(result: VatVentilation): void {
  expect(
    result.subtotalHtCents - result.discountCents + result.extrasHtCents + result.vatTotalCents,
  ).toBe(result.totalCents);
}

describe("ventilateVatExact — la somme des étiquettes", () => {
  /** Régression : 21,00 € affichés, 21,01 € prélevés (plan-centime-particuliers § 1). */
  it("rend 21,00 € pour un banana bread à 21,00 € TTC (5,5 %)", () => {
    const result = plain([label(2100, 5.5)]);

    expect(result).toMatchObject({ subtotalHtCents: 1991, vatTotalCents: 109, totalCents: 2100 });
    expect(result.vat).toEqual([{ rate: 5.5, amountCents: 109 }]);
  });

  it("rend 2,40 € pour deux croissants à 1,90 € et 0,50 €", () => {
    const result = plain([label(190, 5.5), label(50, 5.5)]);

    expect(result).toMatchObject({ subtotalHtCents: 227, vatTotalCents: 13, totalCents: 240 });
  });

  /** Objection B1 : le HT reste Σ des lignes arrondies, la TVA est la différence. */
  it("trois articles à 0,50 € : HT 1,41, TVA 0,09, total 1,50", () => {
    const fifty = label(50, 5.5);
    const result = plain([fifty, fifty, fifty]);

    expect(result).toMatchObject({ subtotalHtCents: 141, vatTotalCents: 9, totalCents: 150 });
    expectRecomposes(result);
  });

  it("arrondit une fois par taux sur deux taux", () => {
    const result = plain([label(2100, 5.5), label(350, 20, 2)]);

    expect(result.totalCents).toBe(2800);
    expect(result.vat.map((share) => share.rate)).toEqual([5.5, 20]);
    expectRecomposes(result);
  });

  it("retranche la remise de retrait des seules lignes éligibles", () => {
    const drink: ExactVatLine = { ...label(350, 20), discountEligible: false };
    const result = ventilateVatExact({
      lines: [label(2100, 5.5, 2), drink],
      eligibleDiscountCents: 200,
      discountCents: 0,
      extras: [],
    });

    // 5,5 % : (3981,042 − 200) × 1,055 = 3989,0 ; 20 % : la boisson intacte, 350.
    expect(result.discountCents).toBe(200);
    expect(result.totalCents).toBe(3989 + 350);
    expectRecomposes(result);
  });

  it("borne la remise de retrait au HT arrondi des lignes éligibles", () => {
    const result = ventilateVatExact({
      lines: [label(2100, 5.5)],
      eligibleDiscountCents: 99_999,
      discountCents: 0,
      extras: [],
    });

    expect(result).toMatchObject({ discountCents: 1991, vat: [], totalCents: 0 });
  });

  /** Objection B2 : le reliquat exact laisserait 0,01 € sous le minimum Stripe. */
  it("un bon qui solde la marchandise met son TTC à zéro", () => {
    const result = ventilateVatExact({
      lines: [label(2100, 5.5)],
      discountCents: 1991,
      extras: [],
    });

    expect(result).toMatchObject({ discountCents: 1991, vatTotalCents: 0, totalCents: 0 });
  });

  it("un bon qui solde laisse le port qui suit la marchandise taxé à son taux", () => {
    const result = ventilateVatExact({
      lines: [label(2100, 5.5)],
      discountCents: 5000,
      extras: [{ htCents: 500, followsGoods: true }],
    });

    expect(result).toMatchObject({ discountCents: 1991, extrasHtCents: 500, totalCents: 528 });
  });

  it("répartit le port qui suit la marchandise au prorata du HT brut de chaque taux", () => {
    const result = ventilateVatExact({
      lines: [label(2100, 5.5), label(350, 20, 2)],
      discountCents: 0,
      extras: [{ htCents: 500, followsGoods: true }],
    });

    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 130 },
      { rate: 20, amountCents: 140 },
    ]);
    expect(result.totalCents).toBe(3344);
    expectRecomposes(result);
  });

  it("taxe un extra à taux propre dans son groupe", () => {
    const result = ventilateVatExact({
      lines: [label(2100, 5.5)],
      discountCents: 0,
      extras: [{ htCents: 500, vatRate: 20 }],
    });

    expect(result.totalCents).toBe(2100 + 600);
  });

  /**
   * La borne du § 3 : l'erreur TTC par pièce est ≤ 0,0006 centime à 20 %, le
   * demi-centime n'est atteint qu'au-delà de ~830 pièces. À 800, toute
   * étiquette retombe sur elle-même.
   */
  it("rend quantité × étiquette jusqu'à 800 pièces à 20 %, pour toute étiquette jusqu'à 30 €", () => {
    const misses: number[] = [];
    for (let ttc = 1; ttc <= 3000; ttc += 1) {
      if (plain([label(ttc, 20, 800)]).totalCents !== ttc * 800) {
        misses.push(ttc);
      }
    }

    expect(misses).toEqual([]);
  });
});
