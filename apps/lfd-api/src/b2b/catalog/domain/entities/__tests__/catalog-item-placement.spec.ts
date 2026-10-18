import { MaskingOutsideAudienceError } from "../../errors/catalog-errors.js";
import type { CatalogAudience } from "../../served-to.js";
import { CatalogItem, type PimFacts } from "../catalog-item.js";

/**
 * Le masquage par audience et la validation pour la boutique publique (lot 3
 * de `plan-catalogue-synchronise-par-audience.md`), éprouvés sur l'agrégat
 * seul. `receivedAt` n'est comparé à aucune horloge.
 */

const FACTS: PimFacts = {
  sku: "VIE-001-1",
  productId: "prd_1",
  productSku: "VIE-001",
  name: "Croissant",
  kind: "daily",
  categoryId: "fam-vien",
  priceMillicents: 200,
  weightGrams: null,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  publicTtcCents: 250,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
  allergens: [],
  allergenLabels: null,
  orderTimeLimit: null,
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
  receivedAt: new Date("2026-08-17T08:00:00.000Z"),
};

function placed(
  audience: CatalogAudience | null,
  publicReviewPending = false,
  proReviewPending = false,
): CatalogItem {
  return CatalogItem.reconstitute({
    facts: FACTS,
    withdrawnAt: null,
    decision: null,
    placement: { audience, publicReviewPending, proReviewPending },
  });
}

describe("CatalogItem — le masquage par audience", () => {
  it("masque pour une audience sans toucher à l'autre", () => {
    const item = placed("both");

    item.mask("public", "cecile");

    expect(item.isMaskedFor("public")).toBe(true);
    expect(item.isMaskedFor("pro")).toBe(false);
  });

  it("refuse de masquer pour une audience que le référentiel ne sert pas", () => {
    const item = placed("pro");

    expect(() => item.mask("public", "cecile")).toThrow(MaskingOutsideAudienceError);
    expect(item.isMaskedFor("public")).toBe(false);
  });

  it("lit une audience jamais reçue comme `both` : masquer reste permis", () => {
    const item = placed(null);

    item.mask("pro", "cecile");

    expect(item.isMaskedFor("pro")).toBe(true);
  });

  it("laisse toujours démasquer, même hors audience — retirer un masque ne montre rien", () => {
    const item = CatalogItem.reconstitute({
      facts: FACTS,
      withdrawnAt: null,
      decision: {
        isHidden: false,
        isHiddenPublic: true,
        isFeaturedPro: false,
        isFeaturedPublic: false,
        decidedBy: "cecile",
      },
      placement: { audience: "pro", publicReviewPending: false, proReviewPending: false },
    });

    item.unmask("public", "cecile");

    expect(item.isMaskedFor("public")).toBe(false);
  });

  it("garde l'audience et l'attente à travers un rafraîchissement du push", () => {
    const item = placed("both", true, true).refreshFromPim({ ...FACTS, name: "Croissant beurre" });

    expect(item.audience).toBe("both");
    expect(item.isReviewPendingFor("public")).toBe(true);
    expect(item.isReviewPendingFor("pro")).toBe(true);
  });
});

describe("CatalogItem — la validation par audience", () => {
  it("lève l'attente d'une audience sans toucher à l'autre, et le dit", () => {
    const item = placed("both", true, true);

    expect(item.approveFor("pro")).toBe(true);
    expect(item.isReviewPendingFor("pro")).toBe(false);
    expect(item.isReviewPendingFor("public")).toBe(true);
    expect(item.toPersistence().placement).toMatchObject({
      proReviewPending: false,
      publicReviewPending: true,
    });
  });

  it("valider une audience qui n'attend rien ne change rien", () => {
    const item = placed("both", false, false);

    expect(item.approveFor("public")).toBe(false);
    expect(item.approveFor("pro")).toBe(false);
  });

  it("un article reçu par le push n'attend aucune validation", () => {
    const item = CatalogItem.receive(FACTS);

    expect(item.isReviewPendingFor("pro")).toBe(false);
    expect(item.isReviewPendingFor("public")).toBe(false);
    expect(item.audience).toBeNull();
  });
});
