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
    staffMayExceed: false,
    ...over,
  };
}

/**
 * Décisions de Hugo (2026-10-21 et 2026-11-23) : une limite par produit ou par
 * famille, délai ET heure, sans rattrapage.
 */
describe("OrderTimeLimit", () => {
  it("pose la limite d'un produit", () => {
    const limit = OrderTimeLimit.set("l1", payload());

    expect([limit.daysBefore, limit.time, limit.graceMinutes]).toEqual([2, "12:00", null]);
  });

  it("pose la limite d'une famille", () => {
    const limit = OrderTimeLimit.set("l1", payload({ scope: { type: "category", id: "cat_1" } }));

    expect([limit.scope.type, limit.daysBefore, limit.time]).toEqual(["category", 2, "12:00"]);
  });

  it.each([
    ["global", null],
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
      null,
    );

    expect(residual.scope.type).toBe("global");
    expect(() => {
      residual.reset(payload({ scope: { type: "global", id: null } }));
    }).toThrow(RetiredOrderTimeLimitScopeError);
  });
});

/** L'instant n'est comparé qu'à lui-même : aucune horloge n'est en jeu. */
const AT = new Date("2026-11-18T09:00:00.000Z");

describe("l'archive d'une limite", () => {
  it("s'archive en gardant ses valeurs, une seule fois", () => {
    const limit = OrderTimeLimit.set("l1", payload());

    expect(limit.archive(AT)).toBe(true);
    expect(limit.archive(AT)).toBe(false);
    expect([limit.isArchived, limit.daysBefore, limit.time]).toEqual([true, 2, "12:00"]);
  });

  it("se restaure, et la restauration rejouée ne change rien", () => {
    const limit = OrderTimeLimit.set("l1", payload());
    limit.archive(AT);

    expect(limit.restore()).toBe(true);
    expect(limit.restore()).toBe(false);
    expect(limit.archivedAt).toBeNull();
  });

  it("reposée à l'identique sur sa portée, une limite archivée revient en vigueur", () => {
    const limit = OrderTimeLimit.set("l1", payload());
    limit.archive(AT);

    expect(limit.reset(payload())).toBe(true);
    expect(limit.isArchived).toBe(false);
  });

  it("une ligne résiduelle s'archive aussi", () => {
    const residual = OrderTimeLimit.reconstitute(
      "vieux",
      payload({ scope: { type: "global", id: null }, graceMinutes: 60 }),
      null,
    );

    expect(residual.archive(AT)).toBe(true);
  });
});

describe("la case « l'équipe peut passer outre »", () => {
  it("se pose avec la limite, décochée si on ne la coche pas", () => {
    expect(OrderTimeLimit.set("l1", payload()).staffMayExceed).toBe(false);
    expect(OrderTimeLimit.set("l1", payload({ staffMayExceed: true })).staffMayExceed).toBe(true);
  });

  it("cochée seule, sans autre réglage changé, est un changement", () => {
    const limit = OrderTimeLimit.set("l1", payload());

    expect(limit.reset(payload({ staffMayExceed: true }))).toBe(true);
    expect(limit.staffMayExceed).toBe(true);
  });

  it("reposée identique, ne change rien", () => {
    const limit = OrderTimeLimit.set("l1", payload({ staffMayExceed: true }));

    expect(limit.reset(payload({ staffMayExceed: true }))).toBe(false);
  });

  it("décochée seule est un changement", () => {
    const limit = OrderTimeLimit.set("l1", payload({ staffMayExceed: true }));

    expect(limit.reset(payload())).toBe(true);
    expect(limit.staffMayExceed).toBe(false);
  });
});
