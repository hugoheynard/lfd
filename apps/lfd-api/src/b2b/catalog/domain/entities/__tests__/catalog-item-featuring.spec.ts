import {
  CannotFeatureHiddenItemError,
  FeaturingOutsideAudienceError,
} from "../../errors/catalog-errors.js";
import type { CatalogAudience } from "../../served-to.js";
import { CatalogItem, type PimFacts } from "../catalog-item.js";

/**
 * La mise en avant par audience (Hugo, 2026-10-18 : « on peut mettre en avant
 * public et pro »), éprouvée sur l'agrégat seul. `receivedAt` n'est comparé à
 * aucune horloge.
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
  mayContain: null,
  allergensPrecautionary: false,
  orderTimeLimit: null,
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
  receivedAt: new Date("2026-08-17T08:00:00.000Z"),
};

function placed(audience: CatalogAudience | null): CatalogItem {
  return CatalogItem.reconstitute({
    facts: FACTS,
    withdrawnAt: null,
    decision: null,
    placement: { audience, publicReviewPending: false, proReviewPending: false },
  });
}

describe("CatalogItem — la mise en avant par audience", () => {
  it("met en avant chez les pros sans toucher au public", () => {
    const item = placed("both");

    item.feature("pro", "cecile");

    expect(item.isFeaturedFor("pro")).toBe(true);
    expect(item.isFeaturedFor("public")).toBe(false);
  });

  it("met en avant des deux côtés, indépendamment", () => {
    const item = placed(null);

    item.feature("pro", "cecile");
    item.feature("public", "cecile");
    item.unfeature("pro", "cecile");

    expect(item.isFeaturedFor("pro")).toBe(false);
    expect(item.isFeaturedFor("public")).toBe(true);
  });

  it("refuse une audience que le référentiel ne sert pas, sans rien écrire", () => {
    const item = placed("pro");

    expect(() => item.feature("public", "cecile")).toThrow(FeaturingOutsideAudienceError);
    expect(item.toPersistence().decision).toBeNull();
  });

  it("refuse un article masqué POUR CETTE audience seulement", () => {
    const item = placed("both");
    item.mask("public", "cecile");

    expect(() => item.feature("public", "cecile")).toThrow(CannotFeatureHiddenItemError);
    item.feature("pro", "cecile");
    expect(item.isFeaturedFor("pro")).toBe(true);
  });

  it("masquer au public éteint la mise en avant publique, pas la pro", () => {
    const item = placed("both");
    item.feature("pro", "cecile");
    item.feature("public", "cecile");

    item.mask("public", "cecile");

    expect(item.isFeaturedFor("public")).toBe(false);
    expect(item.isFeaturedFor("pro")).toBe(true);
  });

  it("laisse toujours retirer la mise en avant, même hors audience", () => {
    const item = placed("pro");

    item.unfeature("public", "cecile");

    expect(item.isFeaturedFor("public")).toBe(false);
  });

  it("🔴 retient la décision quand la mise en avant publique est la SEULE", () => {
    const item = placed("public");

    item.feature("public", "cecile");

    expect(item.toPersistence().decision).toMatchObject({
      isFeaturedPro: false,
      isFeaturedPublic: true,
    });
  });
});
