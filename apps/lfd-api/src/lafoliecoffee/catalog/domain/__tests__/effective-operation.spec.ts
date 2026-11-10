import { operationAsHeld } from "../effective-operation.js";
import type { CatalogOperationFacts } from "../entities/catalog-operation.js";

/** Les dates ne sont comparées qu'entre elles — la fonction n'a pas d'horloge. */

const CLOSE = new Date("2026-12-21T11:00:00.000Z");

const noel: CatalogOperationFacts = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-10-31T23:00:00.000Z"),
  orderFrom: null,
  orderUntil: CLOSE,
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-9-1", "VIE-001-1", "PAT-7-1"],
  receivedAt: new Date("2026-09-01T00:00:00.000Z"),
};

describe("operationAsHeld — ce que la boutique applique", () => {
  it("lit les champs de l'opération et son `hidden` tenu au commerce", () => {
    expect(operationAsHeld(noel, true)).toEqual({
      key: "noel-2026",
      isHidden: true,
      orderUntil: CLOSE,
      audience: "both",
      skus: ["PAT-9-1", "VIE-001-1", "PAT-7-1"],
    });
  });

  it("rend une sélection à part, que l'appelant peut trier sans toucher aux faits", () => {
    const held = operationAsHeld(noel, false);

    expect(held.isHidden).toBe(false);
    expect(held.skus).not.toBe(noel.skus);
    expect(held.skus).toEqual(noel.skus);
  });
});
