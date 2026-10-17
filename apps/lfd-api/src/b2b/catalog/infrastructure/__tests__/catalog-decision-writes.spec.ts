import type {
  CatalogItemState,
  LocalDecision,
  PimFacts,
} from "../../domain/entities/catalog-item.js";
import { decisionWritesOf, posedDecisionsStatement } from "../catalog-decision-writes.js";

/**
 * Les décisions d'un lot : réparties en « effacées » et « posées », les
 * posées écrites en UNE instruction, sans jamais toucher aux colonnes de prix.
 */

const HIDDEN: LocalDecision = {
  isHidden: true,
  isHiddenPublic: false,
  isFeatured: false,
  decidedBy: "staff_1",
};

function factsOf(sku: string): PimFacts {
  return {
    sku,
    productId: "p_1",
    productSku: "VIE-001",
    name: "Croissant",
    kind: "daily",
    categoryId: "c",
    priceMillicents: 100_000,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: null,
    publicByContext: null,
    allergens: null,
    allergenLabels: null,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    orderTimeLimit: null,
    receivedAt: new Date(0),
  };
}

function state(sku: string, decision: LocalDecision | null): CatalogItemState {
  return {
    facts: factsOf(sku),
    withdrawnAt: null,
    placement: { audience: "both", publicReviewPending: false, proReviewPending: false },
    decision,
  };
}

describe("decisionWritesOf", () => {
  it("sépare les décisions effacées des décisions posées", () => {
    const writes = decisionWritesOf([state("A", null), state("B", HIDDEN), state("C", null)]);

    expect(writes.cleared).toEqual(["A", "C"]);
    expect(writes.posed).toEqual([{ sku: "B", decision: HIDDEN }]);
  });
});

describe("posedDecisionsStatement", () => {
  // P2028 (2026-10-17) : une écriture de décision par article allongeait la transaction.
  it("écrit 70 décisions en une instruction, decided_at compris", () => {
    const posed = Array.from({ length: 70 }, (_, index) => ({
      sku: `S-${String(index)}`,
      decision: HIDDEN,
    }));
    const statement = posedDecisionsStatement(posed, new Date(0));

    expect(statement.sql.match(/INSERT INTO/g)).toHaveLength(1);
    expect(statement.sql).toContain('"decided_at" = EXCLUDED."decided_at"');
    expect(statement.values).toHaveLength(70 * 6);
  });

  /** Lot D : les prix décidés restent en base, ni lus ni écrits. */
  it("ne cite aucune colonne de prix décidé", () => {
    const statement = posedDecisionsStatement([{ sku: "A", decision: HIDDEN }], new Date(0));

    expect(statement.sql).not.toContain("price_millicents");
    expect(statement.sql).not.toContain("decided_public_ttc_cents");
  });
});
