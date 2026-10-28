import { composeTtcOrder, type TtcOrderInput } from "../ttc-order.js";
import { pieces } from "../sale-quantity.js";
import { grams } from "../sale-quantity.js";
import { labelled, quantified, violations } from "./ttc-order-support.js";

function compose(input: TtcOrderInput) {
  const result = composeTtcOrder(input);
  expect(violations(input, result)).toEqual([]);
  return result;
}

describe("composeTtcOrder — le particulier paie la somme des étiquettes", () => {
  it("banana bread 21,00 € à 5,5 % : TVA 1,10, HT 19,90 (constat du plan, § 1)", () => {
    const result = compose({ lines: [labelled(2100, 5.5)] });

    expect(result.total).toEqual({ ttcCents: 2100, vatCents: 110, htCents: 1990 });
  });

  it("30 × 0,50 € à 20 % : TVA 2,50, dix lignes à 9 c puis vingt à 8", () => {
    const lines = Array.from({ length: 30 }, () => labelled(50, 20));
    const result = compose({ lines });

    expect(result.total).toEqual({ ttcCents: 1500, vatCents: 250, htCents: 1250 });
    expect(result.lines.map((line) => line.vatCents)).toEqual([
      ...Array<number>(10).fill(9),
      ...Array<number>(20).fill(8),
    ]);
  });

  it("croissants 1,90 + 0,50 € à 5,5 % : 2,40 / 0,13 / 2,27", () => {
    const result = compose({ lines: [labelled(190, 5.5), labelled(50, 5.5)] });

    expect(result.total).toEqual({ ttcCents: 240, vatCents: 13, htCents: 227 });
  });

  it("ticket U : 11,03 à 5,5 % → TVA 0,58 ; 13,45 à 20 % → TVA ⌈2,2417⌉ = 2,25", () => {
    const result = compose({ lines: [labelled(1103, 5.5), labelled(1345, 20)] });

    expect(result.byRate).toEqual([
      { vatRate: 5.5, ttcCents: 1103, vatCents: 58, htCents: 1045 },
      { vatRate: 20, ttcCents: 1345, vatCents: 225, htCents: 1120 },
    ]);
    expect(result.total.ttcCents).toBe(2448);
  });

  it("une ligne offerte reste à 0 HT, 0 TVA", () => {
    const result = compose({ lines: [labelled(0, 5.5), labelled(333, 5.5)] });

    expect(result.lines[0]).toMatchObject({ ttcCents: 0, vatCents: 0, htCents: 0 });
  });
});

describe("composeTtcOrder — remise retrait (R2)", () => {
  // 3,33 € HT à 5,5 % → étiquette 3,51 ; 3,33 € HT à 20 % → 4,00.
  const twoRates = [
    { unitMillicents: 333_000, quantity: pieces(1), vatRate: 5.5 },
    { unitMillicents: 333_000, quantity: pieces(1), vatRate: 20 },
  ];

  it("−10 % sur 7,51 € TTC éligible : 0,75 €, découpé 0,35 / 0,40 (égalité au demi du HT, 6,66 × 10 %)", () => {
    const result = compose({ lines: twoRates, pickupDiscount: { mode: "percent", bp: 1000 } });

    expect(result.lines.map((line) => line.ttcCents)).toEqual([351, 400]);
    expect(result.pickupDiscount.ttcCents).toBe(75);
    expect(result.pickupDiscount.parts.map((part) => [part.vatRate, part.ttcCents])).toEqual([
      [5.5, 35],
      [20, 40],
    ]);
    expect(result.total.ttcCents).toBe(676);
  });

  it("un pourcentage s'arrondit au plus proche, la moitié vers le haut : 10 % de 21,05 € = 2,11 €", () => {
    const result = compose({
      lines: [labelled(2105, 5.5)],
      pickupDiscount: { mode: "percent", bp: 1000 },
    });

    expect(result.pickupDiscount.ttcCents).toBe(211);
  });

  it("un montant fixe saisi HT se convertit au prorata des taux éligibles", () => {
    const result = compose({ lines: twoRates, pickupDiscount: { mode: "amount", cents: 100 } });

    // 100 × (351 × 1,055 + 400 × 1,20) / 751 = 113,22 → 1,13 € TTC.
    expect(result.pickupDiscount.ttcCents).toBe(113);
    expect(result.total.ttcCents).toBe(751 - 113);
  });

  it("une ligne exclue n'entre pas dans l'assiette, et la remise est bornée au TTC éligible", () => {
    const result = compose({
      lines: [labelled(200, 5.5), labelled(350, 20, 1, false)],
      pickupDiscount: { mode: "amount", cents: 10_000 },
    });

    expect(result.pickupDiscount.ttcCents).toBe(200);
    expect(result.pickupDiscount.parts).toEqual([
      expect.objectContaining({ vatRate: 5.5, ttcCents: 200 }),
    ]);
    expect(result.total.ttcCents).toBe(350);
  });
});

describe("composeTtcOrder — bon de fidélité (R3, valeur faciale TTC)", () => {
  it("un bon qui solde laisse 0 € à prélever, sans TVA ni HT", () => {
    const result = compose({ lines: [labelled(450, 5.5), labelled(300, 20)], voucherCents: 2000 });

    expect(result.voucher.ttcCents).toBe(750);
    expect(result.total).toEqual({ ttcCents: 0, vatCents: 0, htCents: 0 });
  });

  it("bon de 5,00 € sur une ligne de 5,01 € à 5,5 % : ligne TVA 0,27, bon −0,26", () => {
    const result = compose({ lines: [labelled(501, 5.5)], voucherCents: 500 });

    expect(result.lines[0]?.vatCents).toBe(27);
    expect(result.voucher.vatCents).toBe(26);
    expect(result.total).toEqual({ ttcCents: 1, vatCents: 1, htCents: 0 });
  });

  it("se prend sur le TTC laissé par la remise retrait", () => {
    const result = compose({
      lines: [labelled(1000, 5.5)],
      pickupDiscount: { mode: "percent", bp: 1000 },
      voucherCents: 2000,
    });

    expect(result.voucher.ttcCents).toBe(900);
  });
});

describe("composeTtcOrder — port (R1, R1 bis)", () => {
  it("standard : 5,00 € HT → 6,00 € TTC à 20 %, même sur un panier à 5,5 %", () => {
    const result = compose({
      lines: [labelled(2100, 5.5)],
      deliveryFee: { adjustment: { mode: "amount", cents: 500 }, vatMode: "standard" },
    });

    expect(result.deliveryFee.parts).toEqual([
      { vatRate: 20, ttcCents: 600, vatCents: 100, htCents: 500 },
    ]);
    expect(result.total.ttcCents).toBe(2700);
  });

  it("suit la marchandise : découpé au prorata du TTC par taux, chaque part à son taux", () => {
    const result = compose({
      lines: [labelled(1000, 5.5), labelled(1000, 20)],
      deliveryFee: { adjustment: { mode: "amount", cents: 500 }, vatMode: "followsGoods" },
    });

    // 250 × 1,055 + 250 × 1,20 = 563,75 → 5,64 €.
    expect(result.deliveryFee.ttcCents).toBe(564);
    expect(result.deliveryFee.parts.map((part) => part.vatRate)).toEqual([5.5, 20]);
  });

  it("qui suit la marchandise sans marchandise prend le taux normal", () => {
    const result = compose({
      lines: [],
      deliveryFee: { adjustment: { mode: "amount", cents: 500 }, vatMode: "followsGoods" },
    });

    expect(result.deliveryFee.parts).toEqual([
      { vatRate: 20, ttcCents: 600, vatCents: 100, htCents: 500 },
    ]);
  });

  it("un TTC figé (BL partiel) se reprend tel quel, découpé au prorata du TTC livré", () => {
    const result = compose({
      lines: [labelled(1000, 5.5), labelled(3000, 20)],
      deliveryFee: {
        adjustment: { mode: "amount", cents: 500 },
        vatMode: "followsGoods",
        frozenTtcCents: 564,
      },
    });

    // Converti sur ce mélange, le barème rendrait 5,88 € : le figé gagne.
    expect(result.deliveryFee.ttcCents).toBe(564);
    expect(result.deliveryFee.parts.map((part) => part.ttcCents)).toEqual([141, 423]);
    expect(result.total.ttcCents).toBe(4564);
  });

  it("un TTC figé est ignoré pour un port en pourcentage", () => {
    const result = compose({
      lines: [labelled(2105, 5.5)],
      deliveryFee: {
        adjustment: { mode: "percent", bp: 1000 },
        vatMode: "standard",
        frozenTtcCents: 999,
      },
    });

    expect(result.deliveryFee.ttcCents).toBe(211);
  });

  it("en pourcentage : sur le TTC des marchandises, sans conversion", () => {
    const result = compose({
      lines: [labelled(2105, 5.5)],
      deliveryFee: { adjustment: { mode: "percent", bp: 1000 }, vatMode: "standard" },
    });

    expect(result.deliveryFee.ttcCents).toBe(211);
    expect(result.total.ttcCents).toBe(2316);
  });
});

describe("composeTtcOrder — une ligne au poids (plan de la vente au poids, § 2)", () => {
  it("1 250 g à 12,40 € / kg TTC : 15,50 €, le prix au kilo lu, au poids commandé", () => {
    const result = compose({ lines: [quantified(1240, 5.5, grams(1250))] });

    expect(result.lines[0]).toMatchObject({ labelCents: 1240, ttcCents: 1550 });
    expect(result.total.ttcCents).toBe(1550);
  });

  it("arrondit la ligne au centime : 333 g à 12,40 € / kg font 4,13 €", () => {
    const result = compose({ lines: [quantified(1240, 5.5, grams(333))] });

    expect(result.lines[0]?.ttcCents).toBe(413);
  });

  it("zéro gramme ne coûte rien", () => {
    const result = compose({ lines: [quantified(1240, 5.5, grams(0))] });

    expect(result.total).toEqual({ ttcCents: 0, vatCents: 0, htCents: 0 });
  });
});
