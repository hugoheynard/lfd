import type { OrderTimeLimitPayload } from "@lfd/pim-contracts";

import { ExclusionOnProductLimitError } from "../../errors/order-time-limit-errors.js";
import { OrderTimeLimit } from "../order-time-limit.js";

/** Les instants ne sont comparés qu'entre eux : aucune horloge n'est en jeu. */
const EXCLUDED_AT = new Date("2026-11-20T09:00:00.000Z");
const INCLUDED_AT = new Date("2026-11-21T09:00:00.000Z");

function familyLimit(): OrderTimeLimit {
  return OrderTimeLimit.set("l1", payload({ type: "category", id: "gateaux" }));
}

function payload(scope: OrderTimeLimitPayload["scope"]): OrderTimeLimitPayload {
  return { scope, daysBefore: 2, time: "12:00", graceMinutes: null, staffMayExceed: false };
}

/** Plan de la limite par famille (2026-11-23), D4 et §3.3. */
describe("les exclusions d'une limite de famille", () => {
  it("exclut un produit nommément, une seule fois", () => {
    const limit = familyLimit();

    expect(limit.exclude("ex_1", "fraisier", EXCLUDED_AT)).toBe(true);
    expect(limit.exclude("ex_2", "fraisier", EXCLUDED_AT)).toBe(false);
    expect(limit.excludedProductIds).toEqual(["fraisier"]);
    expect(limit.exclusions).toEqual([
      { id: "ex_1", productId: "fraisier", createdAt: EXCLUDED_AT, removedAt: null },
    ]);
  });

  it("réintègre un produit en datant le retrait, sans effacer l'exclusion", () => {
    const limit = familyLimit();
    limit.exclude("ex_1", "fraisier", EXCLUDED_AT);

    expect(limit.include("fraisier", INCLUDED_AT)).toBe(true);
    expect(limit.include("fraisier", INCLUDED_AT)).toBe(false);
    expect(limit.excludedProductIds).toEqual([]);
    expect(limit.exclusions).toEqual([
      { id: "ex_1", productId: "fraisier", createdAt: EXCLUDED_AT, removedAt: INCLUDED_AT },
    ]);
  });

  it("réintégrer un produit jamais exclu ne change rien", () => {
    expect(familyLimit().include("fraisier", INCLUDED_AT)).toBe(false);
  });

  it("ré-exclure après un retrait crée une nouvelle exclusion", () => {
    const limit = familyLimit();
    limit.exclude("ex_1", "fraisier", EXCLUDED_AT);
    limit.include("fraisier", INCLUDED_AT);

    expect(limit.exclude("ex_2", "fraisier", INCLUDED_AT)).toBe(true);
    expect(limit.exclusions.map((exclusion) => [exclusion.id, exclusion.removedAt])).toEqual([
      ["ex_1", INCLUDED_AT],
      ["ex_2", null],
    ]);
    expect(limit.excludedProductIds).toEqual(["fraisier"]);
  });

  it("refuse d'exclure ou de réintégrer sur la limite d'un produit", () => {
    const limit = OrderTimeLimit.set("l1", payload({ type: "product", id: "fraisier" }));

    expect(() => limit.exclude("ex_1", "fraisier", EXCLUDED_AT)).toThrow(
      ExclusionOnProductLimitError,
    );
    expect(() => limit.include("fraisier", INCLUDED_AT)).toThrow(ExclusionOnProductLimitError);
  });

  it("archivée puis reposée, la limite garde ses exclusions", () => {
    const limit = familyLimit();
    limit.exclude("ex_1", "fraisier", EXCLUDED_AT);
    limit.archive(INCLUDED_AT);

    expect(limit.excludedProductIds).toEqual(["fraisier"]);
    expect(limit.reset(payload({ type: "category", id: "gateaux" }))).toBe(true);
    expect([limit.isArchived, limit.excludedProductIds]).toEqual([false, ["fraisier"]]);
  });

  it("relit ses exclusions depuis la base et ne compte que les vivantes", () => {
    const limit = OrderTimeLimit.reconstitute(
      "l1",
      payload({ type: "category", id: "gateaux" }),
      null,
      [
        { id: "ex_1", productId: "fraisier", createdAt: EXCLUDED_AT, removedAt: INCLUDED_AT },
        { id: "ex_2", productId: "opera", createdAt: EXCLUDED_AT, removedAt: null },
      ],
    );

    expect(limit.excludedProductIds).toEqual(["opera"]);
    expect(limit.include("fraisier", INCLUDED_AT)).toBe(false);
  });
});
