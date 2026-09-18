import type { StaffOverride } from "@lfd/contracts";

import { diffOverrides, isEmptyOverrideDiff } from "../override-diff.js";

const PRICING_WRITE: StaffOverride = { resource: "b2b_pricing", action: "write", effect: "allow" };
const GROWTH_READ: StaffOverride = { resource: "b2b_growth", action: "read", effect: "deny" };
const ORDERS_READ: StaffOverride = { resource: "b2b_orders", action: "read", effect: "allow" };

describe("diffOverrides — ce qu'une édition fait vraiment aux dérogations", () => {
  it("ne voit rien quand l'état demandé est l'état stocké", () => {
    // Le cas qui coûtait : chaque enregistrement recréait toutes les lignes,
    // et réattribuait chaque écart à celui qui venait d'appuyer sur « Enregistrer ».
    const diff = diffOverrides([PRICING_WRITE, GROWTH_READ], [GROWTH_READ, PRICING_WRITE]);

    expect(diff).toEqual({ added: [], removed: [], changed: [] });
    expect(isEmptyOverrideDiff(diff)).toBe(true);
  });

  it("sépare les ajoutées, les retirées et celles dont l'effet change", () => {
    const flipped: StaffOverride = { ...GROWTH_READ, effect: "allow" };

    const diff = diffOverrides([PRICING_WRITE, GROWTH_READ], [flipped, ORDERS_READ]);

    expect(diff.added).toEqual([ORDERS_READ]);
    expect(diff.removed).toEqual([PRICING_WRITE]);
    // `changed` porte le NOUVEL effet : c'est ce qui s'écrit.
    expect(diff.changed).toEqual([flipped]);
    expect(isEmptyOverrideDiff(diff)).toBe(false);
  });

  it("distingue deux actions sur la même ressource", () => {
    const pricingRead: StaffOverride = { resource: "b2b_pricing", action: "read", effect: "allow" };

    const diff = diffOverrides([PRICING_WRITE], [pricingRead]);

    expect(diff.added).toEqual([pricingRead]);
    expect(diff.removed).toEqual([PRICING_WRITE]);
    expect(diff.changed).toEqual([]);
  });
});
