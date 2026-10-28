import { composeTtcOrder, type TtcOrderAdjustment, type TtcOrderInput } from "../ttc-order.js";
import { pieces } from "../sale-quantity.js";
import { rateVatCents } from "../ttc-vat-allocation.js";
import { seeded, violations } from "./ttc-order-support.js";

const RATES = [2.1, 5.5, 10, 20] as const;

function randomBasket(random: () => number): TtcOrderInput {
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(values: readonly T[]): T => values[int(0, values.length - 1)] as T;
  const adjustment = (): TtcOrderAdjustment =>
    random() < 0.5
      ? { mode: "percent", bp: int(0, 10_000) }
      : { mode: "amount", cents: int(0, 3000) };
  return {
    lines: Array.from({ length: int(0, 8) }, () => ({
      unitMillicents: random() < 0.05 ? 0 : int(1, 3_000_000),
      quantity: pieces(int(1, 40)),
      vatRate: pick(RATES),
      discountEligible: random() < 0.8,
    })),
    pickupDiscount: random() < 0.5 ? adjustment() : undefined,
    voucherCents: random() < 0.4 ? int(0, 20_000) : undefined,
    deliveryFee:
      random() < 0.6
        ? { adjustment: adjustment(), vatMode: random() < 0.5 ? "standard" : "followsGoods" }
        : undefined,
  };
}

describe("composeTtcOrder — balayage déterministe (graine fixe)", () => {
  it("tient les invariants du § 4 sur 5 000 paniers", () => {
    const random = seeded(20_261_027);
    const failures: string[] = [];
    for (let n = 0; n < 5000 && failures.length < 5; n += 1) {
      const input = randomBasket(random);
      const found = violations(input, composeTtcOrder(input));
      if (found.length > 0) failures.push(`${JSON.stringify(input)} → ${found.join(", ")}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("rateVatCents — 0 à 200 000 c sur chaque taux", () => {
  it.each(RATES)("à %s %% : TVA ≥ HT net × taux, et de moins d'un centime", (rate) => {
    const bp = BigInt(Math.round(rate * 100));
    const multiplier = 10_000n + bp;
    let failures = 0;
    for (let ttc = 0; ttc <= 200_000; ttc += 1) {
      const vat = BigInt(rateVatCents(ttc, rate));
      const ht = BigInt(ttc) - vat;
      const covers = vat * 10_000n >= ht * bp;
      const tight = (vat - 1n) * multiplier < BigInt(ttc) * bp || vat === 0n;
      if (!covers || !tight) failures += 1;
    }
    expect(failures).toBe(0);
  });
});
