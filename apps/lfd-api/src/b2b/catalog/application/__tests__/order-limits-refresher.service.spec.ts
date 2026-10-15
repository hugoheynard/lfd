import { RecordingOrderLimits } from "../../domain/ports/__tests__/recording-order-limits.js";
import { OrderLimitsRefresher } from "../order-limits-refresher.service.js";

/**
 * La redescente des limites (lot 2b) : rien sans échelle reçue, et seulement
 * ce qui change.
 */

const GLOBAL = {
  scope: { type: "global" as const, id: null },
  daysBefore: 2,
  time: "12:00",
  graceMinutes: null,
};
const ITEM = {
  sku: "VIE-1-1",
  productId: "prd_1",
  variantId: "var_1",
  categoryId: "cat_1",
  current: null,
};

describe("OrderLimitsRefresher", () => {
  /** Avant le premier fait de règles, les limites du push tiennent. */
  it("ne lit ni n'écrit aucun article tant qu'aucune échelle n'est reçue", async () => {
    const limits = new RecordingOrderLimits(null, [], [ITEM]);

    await new OrderLimitsRefresher(limits).refresh(null);

    expect(limits.asked).toEqual([]);
    expect(limits.written).toEqual([]);
  });

  it("réécrit les articles d'une fiche depuis l'échelle reçue", async () => {
    const limits = new RecordingOrderLimits([GLOBAL], [{ id: "cat_1", parentId: null }], [ITEM]);

    await new OrderLimitsRefresher(limits).refresh("prd_1");

    expect(limits.asked).toEqual(["prd_1"]);
    expect(limits.written).toEqual([
      { sku: "VIE-1-1", limit: { daysBefore: 2, time: "12:00", graceMinutes: 0 } },
    ]);
  });

  it("n'écrit rien quand tout est déjà à jour", async () => {
    const limits = new RecordingOrderLimits(
      [GLOBAL],
      [],
      [{ ...ITEM, current: { daysBefore: 2, time: "12:00", graceMinutes: 0 } }],
    );

    await new OrderLimitsRefresher(limits).refresh(null);

    expect(limits.written).toEqual([]);
  });
});
