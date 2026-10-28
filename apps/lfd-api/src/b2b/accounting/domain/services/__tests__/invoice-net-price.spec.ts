import { composeTtcOrder, grams, lineTotalCents, pieces } from "@lfd/money";

import {
  billedUnitPriceMillicents,
  NET_PRICE_TOLERANCE_CENTS,
  netPriceGapCents,
  type NetPriceLine,
} from "../invoice-net-price.js";

/**
 * **L'écart BT-131 contre BT-129 × BT-146, mesuré** — plan
 * `plan-vente-au-poids.md`, § 3 bis, point 5 : les deux cas que vitruve a
 * demandé de chiffrer, et la tolérance PEPPOL-EN16931-R120 (0,02 €).
 */

/** 12,34567 € HT le kilo : un prix au millicentime, le pire cas d'arrondi. */
const PER_KILO = 1_234_567;

/** |BT-129 × BT-146 − BT-131|, en millicentimes exacts. */
function residualMillicents(line: NetPriceLine, price: number): number {
  return Math.abs(price * line.quantityThousandths - line.amountCents * 1_000_000) / 1_000;
}

describe("le prix net (BT-146) — une ligne de particulier de 50 kg", () => {
  // Le TTC se compose sur l'étiquette au kilo arrondie au centime (1 302 c),
  // et le HT est le dernier nombre calculé : 617,06 € au lieu de 617,28 €.
  const ht = composeTtcOrder({
    lines: [{ unitMillicents: PER_KILO, quantity: grams(50_000), vatRate: 5.5 }],
  }).lines[0]?.htCents;
  const line: NetPriceLine = {
    unitPriceMillicents: PER_KILO,
    quantityThousandths: 50_000,
    amountCents: ht ?? Number.NaN,
  };

  it("mesure : le prix des bons s'écarte de 0,22 € — R120 n'en tolère que 0,02", () => {
    expect(ht).toBe(61_706);
    expect(netPriceGapCents(line, PER_KILO)).toBe(22);
    expect(Math.abs(netPriceGapCents(line, PER_KILO))).toBeGreaterThan(NET_PRICE_TOLERANCE_CENTS);
  });

  it("le prix émis est dérivé du montant payé, et l'écart tombe sous le centime", () => {
    const billed = billedUnitPriceMillicents(line);

    expect(billed).toBe(1_234_120);
    expect(residualMillicents(line, billed)).toBeLessThanOrEqual(25);
  });
});

describe("le prix net (BT-146) — une facture du mois de 30 bons au poids", () => {
  const perBon = lineTotalCents(PER_KILO, grams(1_001));
  const line: NetPriceLine = {
    unitPriceMillicents: PER_KILO,
    quantityThousandths: 30 * 1_001,
    amountCents: 30 * perBon,
  };

  it("mesure : trente arrondis au centime font 0,05 € d'écart (370,80 € contre 370,74 €)", () => {
    expect(perBon).toBe(1_236);
    expect(netPriceGapCents(line, PER_KILO)).toBe(-5);
  });

  it("le prix émis est dérivé, et recompose le montant à moins d'un centime", () => {
    const billed = billedUnitPriceMillicents(line);

    expect(billed).toBe(1_234_765);
    expect(residualMillicents(line, billed)).toBeLessThan(1_000);
  });
});

describe("le prix net (BT-146) — la règle", () => {
  it("garde le prix des bons quand il recompose le montant à la tolérance près", () => {
    const line = {
      unitPriceMillicents: PER_KILO,
      quantityThousandths: 1_250,
      amountCents: lineTotalCents(PER_KILO, grams(1_250)),
    };

    expect(billedUnitPriceMillicents(line)).toBe(PER_KILO);
  });

  it("garde le prix à exactement 0,02 € d'écart, le dérive à 0,021 €", () => {
    const at = { unitPriceMillicents: 100_000, quantityThousandths: 1_000, amountCents: 102 };
    const beyond = { unitPriceMillicents: 100_000, quantityThousandths: 1_000, amountCents: 103 };

    expect(billedUnitPriceMillicents(at)).toBe(100_000);
    expect(billedUnitPriceMillicents(beyond)).toBe(103_000);
  });

  it("ne lit pas l'unité : trente bons de pièces à 0,33333 € hors tolérance sont rattrapés pareil", () => {
    const perBon = lineTotalCents(33_333, pieces(7));
    const line = {
      unitPriceMillicents: 33_333,
      quantityThousandths: 30 * 7_000,
      amountCents: 30 * perBon,
    };

    expect(Math.abs(netPriceGapCents(line, 33_333))).toBeGreaterThan(NET_PRICE_TOLERANCE_CENTS);
    expect(residualMillicents(line, billedUnitPriceMillicents(line))).toBeLessThan(1_000);
  });

  it("une tonne : l'écart résiduel du prix dérivé reste sous un demi-centime", () => {
    const line = {
      unitPriceMillicents: PER_KILO,
      quantityThousandths: 1_000_000,
      amountCents: 1_234_000,
    };
    const billed = billedUnitPriceMillicents(line);

    expect(residualMillicents(line, billed)).toBeLessThanOrEqual(500);
  });

  it("1 g à 12,40 € le kilo (1 centime) : le prix des bons tient, rien n'est dérivé", () => {
    const line = { unitPriceMillicents: 1_240_000, quantityThousandths: 1, amountCents: 1 };

    expect(billedUnitPriceMillicents(line)).toBe(1_240_000);
  });

  it("une quantité nulle garde le prix des bons — l'agrégat refusera la ligne", () => {
    expect(
      billedUnitPriceMillicents({ unitPriceMillicents: 5, quantityThousandths: 0, amountCents: 9 }),
    ).toBe(5);
  });
});
