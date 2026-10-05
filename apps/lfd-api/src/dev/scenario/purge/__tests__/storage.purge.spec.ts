import { scenarioPrefixes } from "../storage.purge.js";
import type { ScenarioScope } from "../scenario-scope.js";

/**
 * Ce que la remise retire du stockage : les pièces de SES commandes et de SES
 * journées, jamais un bucket entier (plan §2 bis).
 */
const SCOPE: ScenarioScope = {
  companyIds: ["company-1"],
  userIds: ["user-1"],
  orderIds: ["order-1", "order-2"],
  orderNumbers: ["ORD-1", "ORD-2"],
  days: ["2026-10-04", "2026-10-05"],
};

describe("scenarioPrefixes", () => {
  it("vise les bons de ses commandes dans `customers`, et rien d'autre", () => {
    expect(scenarioPrefixes(SCOPE, { proofKeys: [], roundIds: [] }).customers).toEqual([
      "orders/order-1/",
      "orders/order-2/",
    ]);
  });

  it("vise fiches, comptes du jour, preuves et photos d'incident dans `production`", () => {
    const prefixes = scenarioPrefixes(SCOPE, {
      proofKeys: ["handover/proofs/staging-1/photo"],
      roundIds: ["round-1"],
    });
    expect(prefixes.production).toEqual([
      "orders/order-1/",
      "orders/order-2/",
      "2026-10-04/",
      "2026-10-05/",
      "handover/proofs/staging-1/photo",
      "delivery/incidents/round-1/",
    ]);
  });

  it("ne vise rien quand le scénario n'a rien laissé — jamais le préfixe vide", () => {
    const empty: ScenarioScope = { ...SCOPE, orderIds: [], orderNumbers: [], days: [] };
    const prefixes = scenarioPrefixes(empty, { proofKeys: [], roundIds: [] });
    expect(prefixes).toEqual({ customers: [], production: [] });
  });
});
