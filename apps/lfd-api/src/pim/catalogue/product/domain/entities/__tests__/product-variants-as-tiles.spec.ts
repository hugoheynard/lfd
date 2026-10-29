import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Montrer chaque déclinaison en vignette** (`plan-declinaisons-en-vignette.md`,
 * V1) : cochée par défaut, réversible, sans refus.
 */

const open = (): Product =>
  Product.open({
    id: "prod_1",
    sku: Sku.create("CHO-FLOR"),
    name: { fr: "Florentin" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("CHO-FLOR-1"), name: { fr: "Florentin" } },
  });

describe("Product — chaque déclinaison en vignette", () => {
  it("une fiche naît en montrant chaque déclinaison (Hugo, 2026-10-29)", () => {
    expect(open().variantsAsTiles).toBe(true);
    expect(open().persistenceSnapshot().variantsAsTiles).toBe(true);
  });

  it("se décoche, et dit qu'elle a changé", () => {
    const product = open();

    expect(product.showVariantsAsTiles(false)).toBe(true);
    expect(product.snapshot().variantsAsTiles).toBe(false);
  });

  it("ne dit rien changé quand elle le disait déjà — pas de fait à journaliser", () => {
    expect(open().showVariantsAsTiles(true)).toBe(false);
  });

  it("se règle même archivée : le geste prépare, il ne vend pas", () => {
    const product = open();
    product.archive();

    expect(product.showVariantsAsTiles(false)).toBe(true);
  });

  it("garde l'option à la reconstitution", () => {
    const product = open();
    product.showVariantsAsTiles(false);

    expect(Product.reconstitute(product.persistenceSnapshot()).variantsAsTiles).toBe(false);
  });

  it("une ligne relue sans l'option se lit cochée — la valeur de la colonne", () => {
    const { variantsAsTiles, ...older } = open().persistenceSnapshot();
    void variantsAsTiles;

    expect(Product.reconstitute(older).variantsAsTiles).toBe(true);
  });
});
