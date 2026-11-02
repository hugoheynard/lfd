import { bareVariant, tarte } from "../../../application/__tests__/audience-doubles.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **Sur mesure** — un fait de la fiche (`plan-articles-sur-mesure.md` § 13,
 * D1) : décoché par défaut, réversible, sans refus, et hérité au détachement
 * (13.6-8).
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

function twoVariants(customRecipe: boolean): Product {
  return Product.reconstitute(
    tarte({
      customRecipe,
      variants: [
        bareVariant({ priceCents: 3_200 }),
        bareVariant({
          id: "prd_tarte_v2",
          sku: "PAT-7-2",
          name: { fr: "Six parts" },
          isDefault: false,
          position: 1,
          priceCents: 1_800,
        }),
      ],
    }),
  );
}

function detachSecond(subject: Product): Product {
  return subject.detachVariant("prd_tarte_v2", {
    id: "prd_neuf",
    sku: Sku.create("P-NEUF22"),
    defaultVariant: { id: "prd_neuf_v1", sku: Sku.create("P-NEUF22-1") },
  });
}

describe("Product — sur mesure", () => {
  it("une fiche naît ouverte : le sur mesure se coche, il ne se devine pas", () => {
    expect(open().customRecipe).toBe(false);
    expect(open().persistenceSnapshot().customRecipe).toBe(false);
  });

  it("se coche, et dit qu'elle a changé", () => {
    const product = open();

    expect(product.declareCustomRecipe(true)).toBe(true);
    expect(product.snapshot().customRecipe).toBe(true);
  });

  it("ne dit rien changé quand elle le disait déjà — pas de fait à journaliser", () => {
    expect(open().declareCustomRecipe(false)).toBe(false);
  });

  it("se règle même archivée : le geste prépare, il ne vend pas", () => {
    const product = open();
    product.archive();

    expect(product.declareCustomRecipe(true)).toBe(true);
  });

  it("garde la case à la reconstitution", () => {
    const product = open();
    product.declareCustomRecipe(true);

    expect(Product.reconstitute(product.persistenceSnapshot()).customRecipe).toBe(true);
  });

  it("une ligne relue sans la case se lit ouverte — la valeur de la colonne", () => {
    const { customRecipe, ...older } = open().persistenceSnapshot();
    void customRecipe;

    expect(Product.reconstitute(older).customRecipe).toBe(false);
  });

  /**
   * 13.6-8 : sans l'héritage, détacher la déclinaison d'une recette réservée
   * ferait naître une fiche ouverte, servie à tous les pros dès sa validation.
   */
  it("une déclinaison détachée d'une fiche sur mesure l'est aussi", () => {
    expect(detachSecond(twoVariants(true)).snapshot().customRecipe).toBe(true);
    expect(detachSecond(twoVariants(false)).snapshot().customRecipe).toBe(false);
  });
});
