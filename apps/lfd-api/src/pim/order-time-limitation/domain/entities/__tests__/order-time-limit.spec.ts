import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import {
  IncompleteOrderTimeLimitError,
  ProductGraceRetiredError,
  RetiredOrderTimeLimitScopeError,
} from "../../errors/order-time-limit-errors.js";
import { OrderTimeLimit } from "../order-time-limit.js";

function payload(over: Partial<OrderTimeLimitPayload> = {}): OrderTimeLimitPayload {
  return {
    scope: { type: "product", id: "p1" },
    daysBefore: 2,
    time: "12:00",
    graceMinutes: null,
    ...over,
  };
}

/**
 * Décision de Hugo du 2026-10-21 (`limites-de-commande/schema-des-reglages.md`
 * §4, points 1 à 3) : une limite par produit, délai ET heure, sans rattrapage.
 */
describe("OrderTimeLimit", () => {
  it("pose la limite d'un produit", () => {
    const limit = OrderTimeLimit.set("l1", payload());

    expect([limit.daysBefore, limit.time, limit.graceMinutes]).toEqual([2, "12:00", null]);
  });

  it.each([
    ["global", null],
    ["category", "cat_1"],
    ["variant", "v1"],
  ] as const)("refuse la portée %s en nommant où se règle la générale", (type, id) => {
    expect(() => OrderTimeLimit.set("l1", payload({ scope: { type, id } }))).toThrow(
      RetiredOrderTimeLimitScopeError,
    );
    expect(() => OrderTimeLimit.set("l1", payload({ scope: { type, id } }))).toThrow(
      /Réglages › Commandes › Heure limite/u,
    );
  });

  it("refuse une limite sans délai ou sans heure", () => {
    expect(() => OrderTimeLimit.set("l1", payload({ daysBefore: null }))).toThrow(
      IncompleteOrderTimeLimitError,
    );
    expect(() => OrderTimeLimit.set("l1", payload({ time: null }))).toThrow(
      IncompleteOrderTimeLimitError,
    );
  });

  it("refuse un rattrapage non nul, et range un rattrapage à 0 comme absent", () => {
    expect(() => OrderTimeLimit.set("l1", payload({ graceMinutes: 30 }))).toThrow(
      ProductGraceRetiredError,
    );
    expect(OrderTimeLimit.set("l1", payload({ graceMinutes: 0 })).graceMinutes).toBeNull();
  });

  /** Une ligne d'avant la décision doit se relire, pour pouvoir être retirée. */
  it("relit une ligne globale résiduelle, mais refuse de la modifier", () => {
    const residual = OrderTimeLimit.reconstitute(
      "vieux",
      payload({ scope: { type: "global", id: null }, graceMinutes: 60 }),
    );

    expect(residual.scope.type).toBe("global");
    expect(() => {
      residual.reset(payload({ scope: { type: "global", id: null } }));
    }).toThrow(RetiredOrderTimeLimitScopeError);
  });
});
