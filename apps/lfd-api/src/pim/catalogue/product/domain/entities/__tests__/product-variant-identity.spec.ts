import { BlankVariantInternalLabelError } from "../../errors/variant-label-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Les deux noms d'une déclinaison** (`plan-identite-de-declinaison.md`,
 * I1–I5, § 3) : le libellé interne de l'onglet et le nom de boutique.
 */

const open = (): Product => {
  const product = Product.open({
    id: "prod_1",
    sku: Sku.create("CHO-FLOR"),
    name: { fr: "Florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-FLOR-1"), name: { fr: "Florentin" } },
  });
  product.addVariant({
    id: "var_2",
    sku: Sku.create("CHO-FLOR-2"),
    name: { fr: "Boîte de 220 g" },
    options: {},
  });
  return product;
};

const variantOf = (product: Product, id: string) =>
  product.persistenceSnapshot().variants.find((variant) => variant.id === id);

describe("Product — l'identité d'une déclinaison", () => {
  it("la création écrit les deux : libellé et nom de boutique (I2)", () => {
    const product = open();

    expect(variantOf(product, "var_1")?.internalLabel).toBe("Florentin");
    expect(variantOf(product, "var_2")?.internalLabel).toBe("Boîte de 220 g");
    expect(variantOf(product, "var_2")?.name).toEqual({ fr: "Boîte de 220 g" });
  });

  it("le crayon renomme le libellé et ne touche pas le nom de boutique (I5)", () => {
    const product = open();

    product.renameVariantInternalLabel("var_2", "  Boîte atelier  ");

    expect(product.variantInternalLabel("var_2")).toBe("Boîte atelier");
    expect(variantOf(product, "var_2")?.name).toEqual({ fr: "Boîte de 220 g" });
  });

  it("refuse un libellé vide", () => {
    expect(() => open().renameVariantInternalLabel("var_2", "   ")).toThrow(
      BlankVariantInternalLabelError,
    );
  });

  /**
   * Le BLOQUANT de la contradiction (§ 3) : lu `internal_label ?? name.fr`, un
   * libellé jamais posé suivait le nom de boutique, et le changer renommait
   * l'onglet.
   */
  it("le libellé se fige au premier écart : une ligne relue sans libellé garde l'ANCIEN nom", () => {
    const snapshot = open().persistenceSnapshot();
    const legacy = Product.reconstitute({
      ...snapshot,
      variants: snapshot.variants.map((variant) => ({ ...variant, internalLabel: null })),
    });
    expect(legacy.variantInternalLabel("var_2")).toBe("Boîte de 220 g");

    legacy.renameVariantForShop("var_2", { fr: "Coffret de florentins" });

    expect(legacy.variantInternalLabel("var_2")).toBe("Boîte de 220 g");
    expect(variantOf(legacy, "var_2")?.internalLabel).toBe("Boîte de 220 g");
    expect(variantOf(legacy, "var_2")?.name).toEqual({ fr: "Coffret de florentins" });
  });

  it("un libellé déjà posé ne bouge pas quand le nom de boutique change", () => {
    const product = open();
    product.renameVariantInternalLabel("var_2", "Boîte atelier");

    product.renameVariantForShop("var_2", { fr: "Coffret" });
    product.renameVariantForShop("var_2", { fr: "Coffret II" });

    expect(product.variantInternalLabel("var_2")).toBe("Boîte atelier");
  });

  it("garde le libellé à la reconstitution", () => {
    const product = open();
    product.renameVariantInternalLabel("var_2", "Boîte atelier");

    expect(Product.reconstitute(product.persistenceSnapshot()).variantInternalLabel("var_2")).toBe(
      "Boîte atelier",
    );
  });
});
