import { chainBasketDiscounts, type BasketDiscount } from "../basket-discounts.js";
import { roundToCents } from "../exact.js";
import { pieces } from "../sale-quantity.js";
import { composeTtcOrder, type TtcOrderInput } from "../ttc-order.js";
import { ventilateVat } from "../vat.js";
import { quantified, seeded, violations } from "./ttc-order-support.js";

/** Plusieurs remises de panier (plan des promotions, § 16.1 point PANIER, § 18.4). */

const ONE_RATE = [{ amountCents: 10_000, vatRate: 5.5 }];

function partsSum(parts: ReadonlyMap<number, number>): number {
  return [...parts.values()].reduce((a, b) => a + b, 0);
}

describe("chainBasketDiscounts — l'ordre et les restes", () => {
  it("20 % puis 15 % sur le reste font −32 %, jamais −35 %", () => {
    const { steps } = chainBasketDiscounts(
      ONE_RATE,
      [
        { adjustment: { mode: "percent", bp: 2000 }, coveredLines: [0] },
        { adjustment: { mode: "percent", bp: 1500 }, coveredLines: [0] },
      ],
      "line_ht",
    );

    expect(steps.map((s) => s.amountCents)).toEqual([2000, 1200]);
    expect(steps.map((s) => s.rank)).toEqual([1, 2]);
    expect(roundToCents(steps[1]?.base ?? { num: 0n, den: 1n })).toBe(8000);
  });

  it("un montant fixe après un pourcentage est borné au reste (arbitrage n° 4)", () => {
    const { steps, remainders } = chainBasketDiscounts(
      ONE_RATE,
      [
        { adjustment: { mode: "percent", bp: 9000 }, coveredLines: [0] },
        { adjustment: { mode: "amount", cents: 5000 }, coveredLines: [0] },
      ],
      "line_ht",
    );

    expect(steps.map((s) => s.amountCents)).toEqual([9000, 1000]);
    expect(remainders[0]?.num).toBe(0n);
  });

  it("le plancher : après 100 %, plus rien ne se remise et aucun reste n'est négatif", () => {
    const { steps, remainders } = chainBasketDiscounts(
      ONE_RATE,
      [
        { adjustment: { mode: "percent", bp: 10_000 }, coveredLines: [0] },
        { adjustment: { mode: "amount", cents: 300 }, coveredLines: [0] },
      ],
      "exact_ht",
    );

    expect(steps.map((s) => s.amountCents)).toEqual([10_000, 0]);
    expect(steps[1]?.parts.size).toBe(0);
    expect(remainders.every((r) => r.num >= 0n)).toBe(true);
  });

  it("deux assiettes qui se recouvrent : la seconde part des restes laissés par la première", () => {
    const lines = [
      { amountCents: 1000, vatRate: 5.5 },
      { amountCents: 1000, vatRate: 20 },
      { amountCents: 1000, vatRate: 10 },
    ];
    const { steps } = chainBasketDiscounts(
      lines,
      [
        { adjustment: { mode: "percent", bp: 5000 }, coveredLines: [0, 1] },
        { adjustment: { mode: "percent", bp: 1000 }, coveredLines: [1, 2] },
      ],
      "line_ht",
    );

    // Étape 2 : 500 (reste de la ligne 1) + 1000 (ligne 2) = 1500 → 150.
    expect(steps[1]?.amountCents).toBe(150);
    expect(steps[1]?.parts).toEqual(
      new Map([
        [20, 50],
        [10, 100],
      ]),
    );
    expect(steps[0]?.parts.get(10)).toBeUndefined();
  });

  it("un montant fixe au chemin exact_ht est converti puis ventilé sur les poids convertis", () => {
    const { steps } = chainBasketDiscounts(
      [
        { amountCents: 351, vatRate: 5.5 },
        { amountCents: 400, vatRate: 20 },
      ],
      [{ adjustment: { mode: "amount", cents: 100 }, coveredLines: [0, 1] }],
      "exact_ht",
    );

    // 100 HT → 351×1,055 + 400×1,2 sur 751 → 113,2… → 113 TTC.
    expect(steps[0]?.amountCents).toBe(113);
    expect(partsSum(steps[0]?.parts ?? new Map())).toBe(113);
  });

  it("refuse une couverture sur une ligne inexistante", () => {
    expect(() =>
      chainBasketDiscounts(
        ONE_RATE,
        [{ adjustment: { mode: "percent", bp: 1000 }, coveredLines: [1] }],
        "line_ht",
      ),
    ).toThrow(RangeError);
  });
});

describe("composeTtcOrder — plusieurs remises", () => {
  const lines = [
    quantified(351, 5.5, pieces(3)),
    quantified(400, 20, pieces(2)),
    quantified(1240, 10, pieces(1)),
  ];

  it("une remise totale = la somme des étapes, par taux et en tout", () => {
    const input: TtcOrderInput = {
      lines,
      basketDiscounts: [
        { adjustment: { mode: "percent", bp: 1000 }, coveredLines: [0, 1, 2] },
        { adjustment: { mode: "amount", cents: 250 }, coveredLines: [1, 2] },
      ],
      voucherCents: 200,
    };
    const result = composeTtcOrder(input);

    expect(violations(input, result)).toEqual([]);
    expect(result.basketDiscounts).toHaveLength(2);
    const sum = (k: "ttcCents" | "vatCents" | "htCents") =>
      result.basketDiscounts.reduce((acc, term) => acc + term[k], 0);
    expect(result.pickupDiscount.ttcCents).toBe(sum("ttcCents"));
    expect(result.pickupDiscount.htCents).toBe(sum("htCents"));
    expect(result.pickupDiscount.vatCents).toBe(sum("vatCents"));
    expect(result.basketDiscounts[0]?.ttcCents).toBe(Math.round(0.1 * (1053 + 800 + 1240)));
  });

  it("refuse la remise unique ET la liste sur la même commande", () => {
    expect(() =>
      composeTtcOrder({
        lines,
        pickupDiscount: { mode: "percent", bp: 1000 },
        basketDiscounts: [],
      }),
    ).toThrow(RangeError);
  });

  it("tient les invariants du § 4 sur 2 000 paniers à une à cinq remises (graine fixe)", () => {
    const random = seeded(20_261_030);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const failures: string[] = [];
    for (let n = 0; n < 2000 && failures.length < 5; n += 1) {
      const count = int(1, 6);
      const basket = Array.from({ length: count }, () =>
        quantified(int(0, 3000), [2.1, 5.5, 10, 20][int(0, 3)] ?? 20, pieces(int(1, 9))),
      );
      const discounts: BasketDiscount[] = Array.from({ length: int(1, 5) }, () => ({
        adjustment:
          random() < 0.5
            ? { mode: "percent", bp: int(0, 10_000) }
            : { mode: "amount", cents: int(0, 4000) },
        coveredLines: basket.flatMap((_, i) => (random() < 0.7 ? [i] : [])),
      }));
      const input: TtcOrderInput = {
        lines: basket,
        basketDiscounts: discounts,
        voucherCents: int(0, 500),
      };
      const result = composeTtcOrder(input);
      const found = [...violations(input, result)];
      const stepTtc = result.basketDiscounts.reduce((acc, t) => acc + t.ttcCents, 0);
      if (stepTtc !== result.pickupDiscount.ttcCents) found.push("Σ étapes ≠ remise totale");
      if (found.length > 0) failures.push(`${JSON.stringify(input)} → ${found.join(", ")}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("ventilateVat — plusieurs remises restreintes", () => {
  it("chaque remise ne retranche que de SES lignes, dans l'ordre", () => {
    const lines = [
      { htCents: 1000, vatRate: 5.5 },
      { htCents: 1000, vatRate: 20 },
    ];
    const result = ventilateVat({
      lines,
      eligibleDiscounts: [
        { cents: 100, coveredLines: [0] },
        { cents: 200, coveredLines: [1] },
      ],
      discountCents: 0,
      extras: [],
    });

    // (1000 − 100) × 5,5 % = 49,5 → 50 ; (1000 − 200) × 20 % = 160.
    expect(result.vat).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 160 },
    ]);
    expect(result.discountCents).toBe(300);
  });

  it("refuse la remise unique ET la liste", () => {
    expect(() =>
      ventilateVat({
        lines: [],
        eligibleDiscountCents: 0,
        eligibleDiscounts: [],
        discountCents: 0,
        extras: [],
      }),
    ).toThrow(RangeError);
  });

  it("chaque étape line_ht : Σ des parts par taux = montant de l'étape (balayage)", () => {
    const random = seeded(30_102_026);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    let failures = 0;
    for (let n = 0; n < 2000; n += 1) {
      const lines = Array.from({ length: int(1, 6) }, () => ({
        amountCents: int(0, 5000),
        vatRate: [5.5, 10, 20][int(0, 2)] ?? 20,
      }));
      const discounts: BasketDiscount[] = Array.from({ length: int(1, 5) }, () => ({
        adjustment:
          random() < 0.5
            ? { mode: "percent", bp: int(0, 10_000) }
            : { mode: "amount", cents: int(0, 6000) },
        coveredLines: lines.flatMap((_, i) => (random() < 0.7 ? [i] : [])),
      }));
      const chain = chainBasketDiscounts(lines, discounts, random() < 0.5 ? "line_ht" : "exact_ht");
      const total = lines.reduce((a, l) => a + l.amountCents, 0);
      const applied = chain.steps.reduce((a, s) => a + s.amountCents, 0);
      if (chain.steps.some((s) => partsSum(s.parts) !== s.amountCents)) failures += 1;
      if (applied > total || chain.remainders.some((r) => r.num < 0n)) failures += 1;
    }
    expect(failures).toBe(0);
  });
});
