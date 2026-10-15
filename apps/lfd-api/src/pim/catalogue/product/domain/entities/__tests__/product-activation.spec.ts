import {
  ArchivedProductNotPublishableError,
  ProductNotActivatableError,
} from "../../errors/product-errors.js";
import { Product, type ProductSnapshot } from "../product.js";
import type { VariantSnapshot } from "../variant.js";

/**
 * **Activer exige de quoi vendre** (1e du plan
 * `plan-catalogue-synchronise-par-audience.md`) : un prix, et un taux par
 * clientèle de l'audience effective. L'audience propre de la fiche est un
 * réglage sans refus.
 */

const SHEET = { declared: ["gluten"], mayContain: [] };

function variant(over: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id: "var_1",
    sku: "PAT-1",
    name: { fr: "Tarte" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 1_000,
    weightGrams: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: SHEET,
    nutrition: null,
    ...over,
  };
}

function product(over: Partial<ProductSnapshot> = {}): Product {
  return Product.reconstitute({
    id: "prd_1",
    sku: "PAT",
    name: { fr: "Tarte" },
    slug: { fr: "tarte" },
    kind: "daily",
    categoryId: "cat_1",
    status: "draft",
    variants: [variant()],
    vatByContext: {},
    channelOverride: null,
    operationOnly: false,
    requiresCold: false,
    audience: null,
    ...over,
  });
}

const BOTH = { b2b: 20, takeaway: 5.5 };

describe("Product.activate — le prix et le taux", () => {
  it("active une fiche tarifée et taxée pour son audience", () => {
    const tarte = product();

    expect(tarte.activate(BOTH, "both")).toBe(true);
    expect(tarte.status).toBe("published");
  });

  it("refuse sans prix, et dit où le saisir", () => {
    const tarte = product({ variants: [variant({ priceCents: null })] });

    expect(() => tarte.activate(BOTH, "both")).toThrow(ProductNotActivatableError);
    expect(() => tarte.activate(BOTH, "both")).toThrow(/PAT-1.*Tarif/);
    expect(tarte.status).toBe("draft");
  });

  /**
   * Le prix se juge sur l'instantané RÉSOLU : une déclinaison alignée sur le
   * défaut porte le prix du défaut, même quand ce défaut est arrêté.
   */
  it("compte le prix hérité d'une déclinaison alignée sur le défaut", () => {
    const tarte = product({
      variants: [
        variant({ isDiscontinued: true }),
        variant({
          id: "var_2",
          sku: "PAT-2",
          isDefault: false,
          position: 1,
          priceCents: null,
          pricingFollowsDefault: true,
        }),
      ],
    });

    expect(tarte.activate(BOTH, "both")).toBe(true);
  });

  it("refuse sans le taux de la clientèle visée, et nomme la clientèle", () => {
    const tarte = product();

    expect(() => tarte.activate({ takeaway: 5.5 }, "both")).toThrow(/b2b.*professionnels/);
  });

  it("dit les deux manques d'un coup plutôt qu'un à la fois", () => {
    const tarte = product({ variants: [variant({ priceCents: null })] });

    expect(() => tarte.activate({}, "public")).toThrow(/PAT-1.*takeaway/);
  });

  it("refuse toujours une fiche archivée, avant tout le reste", () => {
    const tarte = product({ status: "archived", variants: [variant({ priceCents: null })] });

    expect(() => tarte.activate({}, "both")).toThrow(ArchivedProductNotPublishableError);
  });

  it("une fiche déjà active ne re-vérifie rien", () => {
    const tarte = product({ status: "published", variants: [variant({ priceCents: null })] });

    expect(tarte.activate({}, "both")).toBe(false);
  });
});

describe("Product.changeAudience — un réglage sans refus", () => {
  it("naît en héritant de sa famille", () => {
    expect(product().audience).toBeNull();
  });

  it("pose, puis rend à la famille", () => {
    const tarte = product();

    expect(tarte.changeAudience("pro")).toBe(true);
    expect(tarte.persistenceSnapshot().audience).toBe("pro");
    expect(tarte.changeAudience(null)).toBe(true);
    expect(tarte.audience).toBeNull();
  });

  it("dit qu'il n'a rien fait quand l'audience était déjà celle-là", () => {
    expect(product({ audience: "public" }).changeAudience("public")).toBe(false);
  });

  it("se règle sur une fiche active comme sur une archivée", () => {
    expect(product({ status: "published" }).changeAudience("pro")).toBe(true);
    expect(product({ status: "archived" }).changeAudience("pro")).toBe(true);
  });

  it("survit à la reconstitution", () => {
    const tarte = product({ audience: "both" });

    expect(Product.reconstitute(tarte.persistenceSnapshot()).audience).toBe("both");
  });
});
