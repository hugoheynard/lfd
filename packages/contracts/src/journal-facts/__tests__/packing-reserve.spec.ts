import { checkJournalFact } from "../index.js";

/** Plan A1, lot A1.4 — la sortie de réserve. Jour recopié, jamais comparé à l'horloge. */
const DAY = "2030-03-12";

describe("le fait d'une sortie de réserve vers une boutique (plan A1, A1.4)", () => {
  const fact = {
    subjectLabel: DAY,
    serviceDay: DAY,
    site: { id: "site-1", name: "Village" },
    resupplyId: "rsp-1",
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 3 }],
  };

  it("le point nommé, ou son seul id quand l'annuaire ne le nomme pas", () => {
    expect(checkJournalFact("packing_stock.sent_to_shop", fact)).toBeNull();
    expect(checkJournalFact("packing_stock.sent_to_shop", { ...fact, site: "site-1" })).toBeNull();
  });

  it("refuse une quantité négative", () => {
    expect(
      checkJournalFact("packing_stock.sent_to_shop", {
        ...fact,
        lines: [{ sku: "CRO", productName: "Croissant", quantity: -1 }],
      })?.kind,
    ).toBe("invalid_payload");
  });
});
