import { priceBasket } from "../../../../domain/services/price-basket.js";
import { contextOf, PICKUP } from "../../../../domain/services/__tests__/price-basket.fixture.js";
import type { OrderLineSnapshot } from "../../../../domain/value-objects/order-line.js";
import { BackorderLine } from "../../value-objects/backorder-line.js";
import { backorderReplayOf } from "../backorder-replay.js";
import {
  activeDiscount,
  originLine,
  originReplay,
} from "../../../application/__tests__/backorder-conversion-doubles.js";

/**
 * **Le rejeu d'un reliquat dans `priceBasket`** — la seule arithmétique : les
 * cas que la règle du reste ne tranche pas seule (plan, § 4) — le seuil d'une
 * remise que le reste n'atteint plus, et la ligne fixée par une mercuriale.
 */

const PRO = { vatMethod: "line_ht", handoverAt: null } as const;
const NO_VERDICT = { lateFee: null };
const TERMS = {
  cumulative: false,
  minQuantity: 10,
  pickup: "all",
  delivery: "all",
  origin: "placed",
  hours: null,
} as const;

function pricedRemainder(
  origin: ReturnType<typeof originReplay>,
  remainder: readonly BackorderLine[],
) {
  const replayed = backorderReplayOf(origin, remainder);
  return priceBasket(
    contextOf({ lines: replayed.lines, route: PICKUP, replayed }),
    PRO,
    NO_VERDICT,
  );
}

describe("le rejeu d'un reliquat chiffré par priceBasket", () => {
  it("un reste sous le seuil de la remise la GARDE (décision 11) : le refus n'est qu'une note", () => {
    const origin = originReplay({
      discounts: [activeDiscount({ mode: "percent", bp: 1_000 }, { terms: TERMS })],
    });

    const priced = pricedRemainder(origin, [
      BackorderLine.of({ sku: "PAI-001", quantity: 4, saleUnit: "piece" }),
    ]);

    expect(priced.subtotalCents).toBe(1_200);
    expect(priced.terms.discountCents).toBe(120);
    expect(priced.refusals).toEqual([
      expect.objectContaining({ kind: "below_threshold", minQuantity: 10, quantity: 4 }),
    ]);
  });

  it("une ligne fixée par une mercuriale à l'origine reste hors de l'assiette de la remise rejouée", () => {
    const sealed: OrderLineSnapshot = originLine({
      sku: "BAG-001",
      productName: "Baguette",
      pickupDiscountEligible: false,
    });
    const origin = {
      ...originReplay({ lines: [originLine(), sealed] }),
      // Une remise lue dans les colonnes : sans SKU couverts, l'assiette est
      // celle des lignes remisables de l'origine.
      replayable: {
        activeDiscounts: [],
        discountPromotionId: "promo_col",
        discountAdjustment: { mode: "percent", bp: 1_000 } as const,
        discountLabel: null,
        discountCents: 300,
        discountTtcCents: null,
      },
    };

    const priced = pricedRemainder(origin, [
      BackorderLine.of({ sku: "PAI-001", quantity: 4, saleUnit: "piece" }),
      BackorderLine.of({ sku: "BAG-001", quantity: 4, saleUnit: "piece" }),
    ]);

    // 10 % des seuls pains (12,00 €), la baguette fixée par la mercuriale exclue.
    expect(priced.subtotalCents).toBe(2_400);
    expect(priced.terms.discountCents).toBe(120);
  });

  it("une remise aux SKU couverts n'en couvre pas d'autres", () => {
    const origin = originReplay({
      lines: [originLine(), originLine({ sku: "BAG-001" })],
      discounts: [activeDiscount({ mode: "percent", bp: 1_000 }, { coveredSkus: ["BAG-001"] })],
    });

    const priced = pricedRemainder(origin, [
      BackorderLine.of({ sku: "PAI-001", quantity: 4, saleUnit: "piece" }),
      BackorderLine.of({ sku: "BAG-001", quantity: 2, saleUnit: "piece" }),
    ]);

    expect(priced.terms.discountCents).toBe(60);
  });
});
