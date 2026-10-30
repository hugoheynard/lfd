import { chainBasketDiscounts, type BasketDiscountAdjustment } from "../basket-discounts.js";
import { splitOrderByRate } from "../order-vat-split.js";
import { grams, pieces } from "../sale-quantity.js";
import { composeTtcOrder, type TtcOrderInput, type TtcOrderLine } from "../ttc-order.js";
import { ventilateVat, type VatLine } from "../vat.js";
import { legacyExactDiscountParts, legacyLineHtDiscountCents } from "./basket-discounts-support.js";
import { quantified, violations } from "./ttc-order-support.js";

/**
 * La preuve centrale du lot M1 (plan des promotions, § 18.4) : UNE remise
 * passée en liste rend, au centime, ce que la remise unique rendait — au
 * chemin `exact_ht` (`composeTtcOrder`) comme au chemin `line_ht`
 * (`ventilateVat` + `splitOrderByRate`).
 */

const PERCENT_10: BasketDiscountAdjustment = { mode: "percent", bp: 1000 };
const PERCENT_ODD: BasketDiscountAdjustment = { mode: "percent", bp: 1250 };
const FIXED_3: BasketDiscountAdjustment = { mode: "amount", cents: 300 };
const FIXED_HUGE: BasketDiscountAdjustment = { mode: "amount", cents: 1_000_000 };

interface ExactCase {
  readonly name: string;
  readonly lines: readonly TtcOrderLine[];
}

const EXACT_CASES: readonly ExactCase[] = [
  { name: "un taux", lines: [quantified(351, 5.5, pieces(2))] },
  {
    name: "deux taux",
    lines: [quantified(351, 5.5, pieces(1)), quantified(400, 20, pieces(1))],
  },
  {
    name: "trois taux et une ligne exclue",
    lines: [
      quantified(1103, 5.5, pieces(3)),
      quantified(1345, 20, pieces(1), false),
      quantified(299, 10, pieces(7)),
    ],
  },
  {
    name: "au poids",
    lines: [quantified(1240, 5.5, grams(333)), quantified(1240, 5.5, grams(1250))],
  },
  {
    name: "au poids et à la pièce, deux taux",
    lines: [quantified(1240, 5.5, grams(777)), quantified(250, 20, pieces(3))],
  },
  { name: "tout exclu", lines: [quantified(500, 5.5, pieces(1), false)] },
];

const ADJUSTMENTS: readonly (readonly [string, BasketDiscountAdjustment])[] = [
  ["10 %", PERCENT_10],
  ["12,5 %", PERCENT_ODD],
  ["fixe 3 € HT", FIXED_3],
  ["fixe borné", FIXED_HUGE],
];

function eligibleIndexes(lines: readonly { readonly discountEligible?: boolean | undefined }[]) {
  return lines.flatMap((line, i) => (line.discountEligible !== false ? [i] : []));
}

describe("exact_ht — une remise en liste = la remise unique d'hier, au centime", () => {
  const table = EXACT_CASES.flatMap((c) => ADJUSTMENTS.map(([label, a]) => [c, label, a] as const));

  it.each(table)("%# %s", (exactCase, _label, adjustment) => {
    const legacy: TtcOrderInput = {
      lines: exactCase.lines,
      pickupDiscount: adjustment,
      voucherCents: 150,
    };
    const listed: TtcOrderInput = {
      lines: exactCase.lines,
      basketDiscounts: [{ adjustment, coveredLines: eligibleIndexes(exactCase.lines) }],
      voucherCents: 150,
    };
    const before = composeTtcOrder(legacy);
    const after = composeTtcOrder(listed);

    expect(after).toEqual(before);
    expect(after.basketDiscounts).toEqual([before.pickupDiscount]);
    expect(violations(listed, after)).toEqual([]);
    const expected = legacyExactDiscountParts(exactCase.lines, adjustment);
    expect(
      new Map(after.pickupDiscount.parts.map((part) => [part.vatRate, part.ttcCents])),
    ).toEqual(new Map([...expected].filter(([, cents]) => cents !== 0)));
  });
});

interface HtCase {
  readonly name: string;
  readonly lines: readonly VatLine[];
}

const HT_CASES: readonly HtCase[] = [
  { name: "un taux", lines: [{ htCents: 1995, vatRate: 5.5 }] },
  {
    name: "deux taux",
    lines: [
      { htCents: 1000, vatRate: 5.5 },
      { htCents: 333, vatRate: 20 },
    ],
  },
  {
    name: "trois taux et une ligne exclue",
    lines: [
      { htCents: 4521, vatRate: 5.5 },
      { htCents: 1000, vatRate: 20, discountEligible: false },
      { htCents: 777, vatRate: 10 },
    ],
  },
  { name: "tout exclu", lines: [{ htCents: 500, vatRate: 5.5, discountEligible: false }] },
];

describe("line_ht — une remise en liste = la remise unique d'hier, au centime", () => {
  const table = HT_CASES.flatMap((c) => ADJUSTMENTS.map(([label, a]) => [c, label, a] as const));

  it.each(table)("%# %s", (htCase, _label, adjustment) => {
    const covered = eligibleIndexes(htCase.lines);
    const cents = legacyLineHtDiscountCents(htCase.lines, adjustment);
    const [step] = chainBasketDiscounts(
      htCase.lines.map((line) => ({ amountCents: line.htCents, vatRate: line.vatRate })),
      [{ adjustment, coveredLines: covered }],
      "line_ht",
    ).steps;
    const legacyInput = {
      lines: htCase.lines,
      eligibleDiscountCents: cents,
      discountCents: 120,
      extras: [],
    };

    expect(step?.amountCents).toBe(cents);
    expect(
      [...(step?.parts ?? new Map<number, number>())]
        .filter(([, amount]) => amount !== 0)
        .sort(([a], [b]) => a - b)
        .map(([vatRate, amountCents]) => ({ vatRate, amountCents })),
    ).toEqual(splitOrderByRate(legacyInput).eligibleDiscount);
    expect(
      ventilateVat({
        lines: htCase.lines,
        eligibleDiscounts: [{ cents: step?.amountCents ?? 0, coveredLines: covered }],
        discountCents: 120,
        extras: [],
      }),
    ).toEqual(ventilateVat(legacyInput));
  });
});
