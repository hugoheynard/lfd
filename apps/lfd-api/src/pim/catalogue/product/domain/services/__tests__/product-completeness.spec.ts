import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../../entities/product.js";
import { ProductCompleteness } from "../product-completeness.js";
import type { CompletenessRules } from "../variant-completeness.js";

const RULES: CompletenessRules = { activeContextKeys: ["b2b"] };
const VAT = { b2b: 20 };

function aProduct(): Product {
  return Product.open({
    id: "prd_1",
    sku: Sku.create("CHO-001"),
    name: { fr: "Gros florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-001-1"), name: { fr: "Boîte" } },
  });
}

describe("ProductCompleteness — le jugement de complétude d'une fiche", () => {
  it("un brouillon sans tarif n'est pas activable, et dit ce qui manque", () => {
    const product = aProduct();
    const completeness = ProductCompleteness.of({
      status: product.status,
      variants: product.resolvedVariants(),
      audience: null,
    });
    expect(completeness.isActivatable(VAT, RULES, [], "both")).toBe(false);
    expect(Object.keys(completeness.gaps(VAT, RULES, [], "both").byVariant)).toEqual(["CHO-001-1"]);
  });

  it("l'agrégat juge avec le même service : même réponse par la fiche et par le service", () => {
    const product = aProduct();
    const completeness = ProductCompleteness.of({
      status: product.status,
      variants: product.resolvedVariants(),
      audience: null,
    });
    expect(product.complianceWith(VAT, RULES, [], "both")).toEqual(
      completeness.findings(VAT, RULES, [], "both"),
    );
  });

  it("une fiche déjà en ligne n'est pas « à activer », même complète", () => {
    const product = aProduct();
    const completeness = ProductCompleteness.of({
      status: "published",
      variants: product.resolvedVariants(),
      audience: null,
    });
    expect(completeness.isActivatable(VAT, RULES, [], "both")).toBe(false);
  });
});
