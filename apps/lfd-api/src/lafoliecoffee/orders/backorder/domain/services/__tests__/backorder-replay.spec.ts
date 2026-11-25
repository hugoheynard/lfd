import { BackorderOriginLineMissingError } from "../../errors/backorder-errors.js";
import { BackorderLine } from "../../value-objects/backorder-line.js";
import { backorderReplayOf } from "../backorder-replay.js";
import {
  activeDiscount,
  originLine,
  originReplay,
} from "../../../application/__tests__/backorder-conversion-doubles.js";

/**
 * **Le prix d'origine d'un reliquat, en rejeu** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4,
 * décisions 5 et 11) : les lignes de l'origine à la quantité du reliquat, et
 * les seules remises en pourcentage.
 */

function remainder(sku: string, quantity: number, saleUnit = "piece"): BackorderLine {
  return BackorderLine.of({ sku, quantity, saleUnit });
}

describe("backorderReplayOf — les lignes", () => {
  it("ramène la ligne d'origine à la quantité du reliquat, au prix unitaire figé", () => {
    const replay = backorderReplayOf(originReplay(), [remainder("PAI-001", 4)]);

    expect(replay.lines).toEqual([
      expect.objectContaining({
        sku: "PAI-001",
        quantity: 4,
        unitPriceMillicents: 300_000,
        lineTotalCents: 1_200,
        pickupDiscountEligible: true,
      }),
    ]);
  });

  it("au poids : des grammes, le prix au kilo d'origine, le total à la quantité restante", () => {
    const comte = originLine({
      sku: "FRO-001",
      productName: "Comté",
      saleUnit: "weight",
      quantity: 2_500,
      unitPriceMillicents: 1_200_000,
      lineTotalCents: 3_000,
    });

    const replay = backorderReplayOf(originReplay({ lines: [comte] }), [
      remainder("FRO-001", 700, "weight"),
    ]);

    // 12,00 € le kilo × 0,7 kg = 8,40 €.
    expect(replay.lines).toEqual([
      expect.objectContaining({
        quantity: 700,
        saleUnit: "weight",
        unitPriceMillicents: 1_200_000,
        lineTotalCents: 840,
      }),
    ]);
  });

  it("ne garde que les articles du reliquat, dans son ordre", () => {
    const origin = originReplay({
      lines: [originLine({ sku: "BAG-001" }), originLine({ sku: "PAI-001" })],
    });

    const replay = backorderReplayOf(origin, [remainder("PAI-001", 2)]);

    expect(replay.lines.map((line) => line.sku)).toEqual(["PAI-001"]);
  });

  it("une ligne non remisable à l'origine (mercuriale) le reste", () => {
    const sealed = originLine({ pickupDiscountEligible: false });

    const replay = backorderReplayOf(originReplay({ lines: [sealed] }), [remainder("PAI-001", 1)]);

    expect(replay.lines[0]?.pickupDiscountEligible).toBe(false);
  });

  it("garde l'étiquette TTC d'une ligne de particulier", () => {
    const sealed = originLine({ unitPriceTtcCents: 317, lineTotalTtcCents: 3_170 });

    const replay = backorderReplayOf(originReplay({ lines: [sealed] }), [remainder("PAI-001", 2)]);

    expect(replay.lines[0]?.unitPriceTtcCents).toBe(317);
  });

  it("refuse un article absent de l'origine : son prix serait inventé", () => {
    expect(() => backorderReplayOf(originReplay(), [remainder("XXX-404", 1)])).toThrow(
      BackorderOriginLineMissingError,
    );
  });
});

describe("backorderReplayOf — les remises (la règle du reste)", () => {
  it("garde un pourcentage, sort un montant fixe et une remise figée sans ajustement", () => {
    const percent = activeDiscount({ mode: "percent", bp: 1_000 });
    const origin = originReplay({
      discounts: [percent, activeDiscount({ mode: "amount", cents: 500 }), activeDiscount(null)],
    });

    expect(backorderReplayOf(origin, [remainder("PAI-001", 4)]).discounts).toEqual([percent]);
  });

  it("relit la remise des colonnes quand la table n'en porte pas, pourcentage gardé", () => {
    const origin = {
      ...originReplay(),
      replayable: {
        activeDiscounts: [],
        discountPromotionId: "promo_col",
        discountAdjustment: { mode: "percent", bp: 500 } as const,
        discountLabel: null,
        discountCents: 150,
        discountTtcCents: null,
      },
    };

    expect(backorderReplayOf(origin, [remainder("PAI-001", 4)]).discounts).toEqual([
      expect.objectContaining({
        promotionId: "promo_col",
        adjustment: { mode: "percent", bp: 500 },
      }),
    ]);
  });

  it("une remise des colonnes en montant fixe sort", () => {
    const origin = {
      ...originReplay(),
      replayable: {
        activeDiscounts: [],
        discountPromotionId: null,
        discountAdjustment: { mode: "amount", cents: 300 } as const,
        discountLabel: null,
        discountCents: 300,
        discountTtcCents: null,
      },
    };

    expect(backorderReplayOf(origin, [remainder("PAI-001", 4)]).discounts).toEqual([]);
  });

  it("garde plusieurs pourcentages, dans l'ordre des rangs de l'origine, en écartant le montant fixe entre eux", () => {
    const first = activeDiscount({ mode: "percent", bp: 1_000 }, { orderDiscountId: "od_1" });
    const fixed = activeDiscount({ mode: "amount", cents: 200 }, { orderDiscountId: "od_2" });
    const second = activeDiscount({ mode: "percent", bp: 500 }, { orderDiscountId: "od_3" });

    const replay = backorderReplayOf(originReplay({ discounts: [first, fixed, second] }), [
      remainder("PAI-001", 4),
    ]);

    expect(replay.discounts.map((discount) => discount.orderDiscountId)).toEqual(["od_1", "od_3"]);
  });

  it("une remise en montant fixe seule ne laisse aucune remise", () => {
    const origin = originReplay({ discounts: [activeDiscount({ mode: "amount", cents: 500 })] });

    expect(backorderReplayOf(origin, [remainder("PAI-001", 4)]).discounts).toEqual([]);
  });

  it("une remise sans ajustement seule ne laisse aucune remise", () => {
    const origin = originReplay({ discounts: [activeDiscount(null)] });

    expect(backorderReplayOf(origin, [remainder("PAI-001", 4)]).discounts).toEqual([]);
  });

  it("sans remise à l'origine, aucune remise au reste", () => {
    expect(backorderReplayOf(originReplay(), [remainder("PAI-001", 4)]).discounts).toEqual([]);
  });
});

describe("backorderReplayOf — les bords", () => {
  it("un reliquat vide rend zéro ligne, et garde tout de même les pourcentages", () => {
    const percent = activeDiscount({ mode: "percent", bp: 1_000 });

    const replay = backorderReplayOf(originReplay({ discounts: [percent] }), []);

    expect(replay).toEqual({ lines: [], discounts: [percent] });
  });

  it("suit l'ordre du reliquat, pas celui de l'origine, sur plusieurs lignes", () => {
    const origin = originReplay({
      lines: [originLine({ sku: "BAG-001" }), originLine({ sku: "PAI-001" })],
    });

    const replay = backorderReplayOf(origin, [remainder("PAI-001", 2), remainder("BAG-001", 3)]);

    expect(replay.lines.map((line) => [line.sku, line.quantity])).toEqual([
      ["PAI-001", 2],
      ["BAG-001", 3],
    ]);
  });

  it("une ligne de pro (sans étiquette TTC) reste sans étiquette TTC", () => {
    const replay = backorderReplayOf(originReplay(), [remainder("PAI-001", 4)]);

    expect(replay.lines[0]?.unitPriceTtcCents).toBeNull();
    expect(replay.lines[0]?.lineTotalTtcCents).toBeNull();
  });
});
