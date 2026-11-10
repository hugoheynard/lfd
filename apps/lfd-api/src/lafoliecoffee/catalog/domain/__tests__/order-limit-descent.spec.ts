import type { SyncOrderTimeLimitRule } from "@lfd/catalog-sync";

import { orderLimitChanges, type OrderLimitTarget } from "../order-limit-descent.js";

/**
 * La descente de l'échelle sur la plateforme (lot 2b) — la même
 * implémentation que l'ingestion du push, et seulement ce qui change.
 */

/**
 * Décision de Hugo du 2026-10-21 : une limite par PRODUIT, règle entière, sans
 * rattrapage. Les autres rangs, encore rangés chez le récepteur, sont ignorés.
 */
const PRODUCT: SyncOrderTimeLimitRule = {
  scope: { type: "product", id: "prd_1" },
  daysBefore: 2,
  time: "12:00",
  graceMinutes: 30,
};
const RESIDUAL_GLOBAL: SyncOrderTimeLimitRule = {
  scope: { type: "global", id: null },
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 60,
};
const RESIDUAL_CATEGORY: SyncOrderTimeLimitRule = {
  scope: { type: "category", id: "cat_root" },
  daysBefore: 1,
  time: "16:00",
  graceMinutes: 30,
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
  it("pose la limite du produit, sans rattrapage", () => {
    expect(orderLimitChanges([PRODUCT], TREE, [target()])).toEqual([
      { sku: "TAR-1-1", limit: { daysBefore: 2, time: "12:00", graceMinutes: 0 } },
    ]);
  });

  it("ignore un rang global et une famille résiduels", () => {
    expect(
      orderLimitChanges([RESIDUAL_GLOBAL, RESIDUAL_CATEGORY], TREE, [
        target({ productId: "prd_autre" }),
      ]),
    ).toEqual([]);
  });

  it("ne rend pas un article dont la limite ne change pas", () => {
    const current = { daysBefore: 2, time: "12:00", graceMinutes: 0 };

    expect(orderLimitChanges([PRODUCT, RESIDUAL_GLOBAL], TREE, [target({ current })])).toEqual([]);
  });

  /** Une échelle vidée retire la limite — c'est ce que l'ingestion du push fait. */
  it("efface la limite quand plus aucune règle ne s'applique", () => {
    const current = { daysBefore: 1, time: "18:00", graceMinutes: 0 };

    expect(orderLimitChanges([], TREE, [target({ current })])).toEqual([
      { sku: "TAR-1-1", limit: null },
    ]);
  });
});
