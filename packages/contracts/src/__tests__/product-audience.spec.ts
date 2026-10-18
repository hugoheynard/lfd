import { productAudienceBatchSchema } from "../product-audience.js";

/** La source d'une mesure (§2 bis du plan de recommandation, 2026-10-18). */
describe("productAudienceBatchSchema — source", () => {
  it("admet un geste sans source : le serveur la tient pour `none`", () => {
    const parsed = productAudienceBatchSchema.safeParse({
      events: [{ sku: "PAIN-1", event: "product_viewed" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("admet les trois sources", () => {
    for (const source of ["none", "data", "staff"]) {
      const parsed = productAudienceBatchSchema.safeParse({
        events: [{ sku: "PAIN-1", event: "suggestion_shown", placement: "cart", source }],
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("refuse une source hors de l'énumération", () => {
    const parsed = productAudienceBatchSchema.safeParse({
      events: [{ sku: "PAIN-1", event: "suggestion_shown", placement: "cart", source: "ai" }],
    });
    expect(parsed.success).toBe(false);
  });
});
