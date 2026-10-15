import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import { orderLimitChanges, type OrderLimitTarget } from "../order-limit-descent.js";

/**
 * La descente de l'échelle sur la plateforme (lot 2b) — la même
 * implémentation que l'ingestion du push, et seulement ce qui change.
 */

const GLOBAL: SyncOrderTimeLimitRule = {
  scope: { type: "global", id: null },
  daysBefore: 1,
  time: "18:00",
  graceMinutes: null,
};
const PASTRY: SyncOrderTimeLimitRule = {
  scope: { type: "category", id: "cat_root" },
  daysBefore: null,
  time: "16:00",
  graceMinutes: 30,
};
const ONE_VARIANT: SyncOrderTimeLimitRule = {
  scope: { type: "variant", id: "var_big" },
  daysBefore: 3,
  time: null,
  graceMinutes: null,
};
const TREE = [
  { id: "cat_root", parentId: null },
  { id: "cat_child", parentId: "cat_root" },
];

function target(over: Partial<OrderLimitTarget> = {}): OrderLimitTarget {
  return {
    sku: "TAR-1-1",
    productId: "prd_1",
    variantId: "var_small",
    categoryId: "cat_child",
    current: null,
    ...over,
  };
}

describe("orderLimitChanges", () => {
  it("descend l'échelle champ par champ, par la lignée de la famille", () => {
    expect(orderLimitChanges([GLOBAL, PASTRY], TREE, [target()])).toEqual([
      { sku: "TAR-1-1", limit: { daysBefore: 1, time: "16:00", graceMinutes: 30 } },
    ]);
  });

  it("vise une déclinaison par son identifiant au référentiel", () => {
    const changes = orderLimitChanges([GLOBAL, ONE_VARIANT], TREE, [
      target(),
      target({ sku: "TAR-1-2", variantId: "var_big" }),
    ]);

    expect(changes).toEqual([
      { sku: "TAR-1-1", limit: { daysBefore: 1, time: "18:00", graceMinutes: 0 } },
      { sku: "TAR-1-2", limit: { daysBefore: 3, time: "18:00", graceMinutes: 0 } },
    ]);
  });

  it("ne rend pas un article dont la limite ne change pas", () => {
    const current = { daysBefore: 1, time: "18:00", graceMinutes: 0 };

    expect(orderLimitChanges([GLOBAL], TREE, [target({ current })])).toEqual([]);
  });

  /** Une échelle vidée retire la limite — c'est ce que l'ingestion du push fait. */
  it("efface la limite quand plus aucune règle ne s'applique", () => {
    const current = { daysBefore: 1, time: "18:00", graceMinutes: 0 };

    expect(orderLimitChanges([], TREE, [target({ current })])).toEqual([
      { sku: "TAR-1-1", limit: null },
    ]);
  });
});
