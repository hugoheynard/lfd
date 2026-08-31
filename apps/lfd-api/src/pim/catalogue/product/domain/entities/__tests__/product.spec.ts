import {
  ArchivedProductNotPublishableError,
  InvalidProductVariantsError,
  InvalidVariantPricingError,
  ProductNotPublishableError,
  VariantNotFoundError,
} from "../../errors/product-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product, type ProductSnapshot } from "../product.js";

const open = (): Product =>
  Product.open({
    id: "prod_1",
    sku: Sku.create("PATI-TARTE"),
    name: { fr: "Tarte aux fraises" },
    kind: "daily",
    categoryId: "cat_1",
    defaultVariant: { id: "var_1", sku: Sku.create("PATI-TARTE-1"), name: { fr: "6 parts" } },
  });

/** Un instantané valide qu'on abîme au cas par cas. */
const snapshotWith = (variants: ProductSnapshot["variants"]): ProductSnapshot => ({
  ...open().snapshot(),
  variants,
});

/**
 * Un produit dont les déclinaisons portent (ou non) une fiche réglementaire.
 * La première reste celle par défaut ; les suivantes sont ajoutées à
 * l'instantané, seul chemin possible tant qu'`AddVariant` n'existe pas.
 */
function declared(
  variants: readonly { allergens: readonly string[] | null; isDiscontinued?: boolean }[],
): Product {
  const [template] = open().snapshot().variants;
  return Product.reconstitute(
    snapshotWith(
      variants.map((variant, index) => ({
        ...template!,
        id: `var_${String(index + 1)}`,
        sku: `PATI-TARTE-${String(index + 1)}`,
        isDefault: index === 0,
        isDiscontinued: variant.isDiscontinued ?? false,
        allergens: variant.allergens,
      })),
    ),
  );
}

describe("l’agrégat Product", () => {
  describe("invariant 2 : une déclinaison au moins, une par défaut exactement", () => {
    it("naît avec sa déclinaison par défaut", () => {
      const snapshot = open().snapshot();
      expect(snapshot.variants).toHaveLength(1);
      expect(snapshot.variants[0]?.isDefault).toBe(true);
    });

    it("refuse de reconstituer un produit sans déclinaison", () => {
      expect(() => Product.reconstitute(snapshotWith([]))).toThrow(InvalidProductVariantsError);
    });

    it("refuse de reconstituer un produit sans déclinaison par défaut", () => {
      const [only] = open().snapshot().variants;
      expect(() => Product.reconstitute(snapshotWith([{ ...only!, isDefault: false }]))).toThrow(
        InvalidProductVariantsError,
      );
    });

    it("refuse deux déclinaisons par défaut", () => {
      const [only] = open().snapshot().variants;
      expect(() =>
        Product.reconstitute(snapshotWith([only!, { ...only!, id: "var_2", sku: "X-2" }])),
      ).toThrow(InvalidProductVariantsError);
    });
  });

  describe("le slug suit le nom", () => {
    it("le dérive à l’ouverture", () => {
      expect(open().snapshot().slug.fr).toBe("tarte-aux-fraises");
    });

    it("le re-dérive au renommage", () => {
      const product = open();
      product.rename({ fr: "Tarte fraises & basilic" });
      expect(product.snapshot().slug.fr).toBe("tarte-fraises-basilic");
    });
  });

  describe("le cycle de vie", () => {
    it("naît invisible — c’est ce qui rend l’invariant 7 tenable", () => {
      expect(open().status).toBe("draft");
    });

    it("s’archive et se restaure EN BROUILLON, jamais directement en ligne", () => {
      const product = open();
      product.archive();
      expect(product.status).toBe("archived");
      product.restore();
      expect(product.status).toBe("draft");
    });

    it("archiver deux fois n’est pas une erreur", () => {
      const product = open();
      product.archive();
      expect(() => product.archive()).not.toThrow();
    });
  });

  describe("invariant 7 : on ne met pas en vente ce qu’on ne peut pas étiqueter", () => {
    /** Le produit tel qu'il naît : aucune fiche renseignée. */
    it("refuse de publier tant qu’une déclinaison active n’a pas de fiche", () => {
      expect(() => open().publish()).toThrow(ProductNotPublishableError);
    });

    it("nomme les références en cause plutôt que de dire « non »", () => {
      expect(() => open().publish()).toThrow("PATI-TARTE-1");
    });

    it("publie dès que chaque déclinaison active est étiquetée", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.publish();
      expect(product.status).toBe("published");
    });

    /**
     * `[]` n'est pas une absence de réponse : c'est « aucun allergène », une
     * affirmation positive. La confondre avec `null` interdirait de publier
     * tout ce qui n'en contient pas.
     */
    it("traite « aucun allergène » comme une fiche déclarée", () => {
      const product = declared([{ allergens: [] }]);
      product.publish();
      expect(product.status).toBe("published");
    });

    /** Une déclinaison arrêtée ne part chez aucun canal : elle ne compte pas. */
    it("ignore les déclinaisons arrêtées", () => {
      const product = declared([
        { allergens: ["gluten"] },
        { allergens: null, isDiscontinued: true },
      ]);
      product.publish();
      expect(product.status).toBe("published");
    });

    it("refuse de publier un produit archivé — le restaurer d’abord", () => {
      const product = declared([{ allergens: ["gluten"] }]);
      product.archive();
      expect(() => product.publish()).toThrow(ArchivedProductNotPublishableError);
    });
  });

  describe("dépublier", () => {
    it("ramène en brouillon, pas aux archives", () => {
      const product = declared([{ allergens: [] }]);
      product.publish();
      product.unpublish();
      expect(product.status).toBe("draft");
    });

    it("ne réveille pas un produit archivé", () => {
      const product = open();
      product.archive();
      product.unpublish();
      expect(product.status).toBe("archived");
    });

    it("sur un brouillon, ne fait rien", () => {
      const product = open();
      product.unpublish();
      expect(product.status).toBe("draft");
    });
  });

  describe("le tarif d’une déclinaison", () => {
    it("s’applique à une déclinaison du produit", () => {
      const product = open();
      product.priceVariant("var_1", { priceCents: 1250, weightGrams: 480 });
      expect(product.snapshot().variants[0]?.priceCents).toBe(1250);
      expect(product.snapshot().variants[0]?.weightGrams).toBe(480);
    });

    /** Sans cette garde, une requête forgée tarifait la variante d’un autre. */
    it("refuse une déclinaison qui n’est pas la sienne", () => {
      expect(() =>
        open().priceVariant("var_dautrui", {
          priceCents: 100,
          weightGrams: null,
        }),
      ).toThrow(VariantNotFoundError);
    });

    it("accepte de dé-tarifer (null)", () => {
      const product = open();
      product.priceVariant("var_1", { priceCents: 1250, weightGrams: 480 });
      product.priceVariant("var_1", { priceCents: null, weightGrams: null });
      expect(product.snapshot().variants[0]?.priceCents).toBeNull();
    });

    /**
     * La route HTTP exigeait déjà `int().min(0)`, le domaine non : un seed ou
     * un import passait à côté, et un demi-centime partait chez Shopify.
     */
    it.each([
      ["un prix négatif", -1, null],
      ["un prix fractionnaire", 12.5, null],
      ["un poids négatif", null, -3],
      ["un poids fractionnaire", null, 1.5],
    ])("refuse %s", (_label, priceCents, weightGrams) => {
      expect(() =>
        open().priceVariant("var_1", {
          priceCents: priceCents,
          weightGrams: weightGrams,
        }),
      ).toThrow(InvalidVariantPricingError);
    });
  });

  it("dit ce qui lui appartient, pour les verbes qui écrivent ailleurs", () => {
    const product = open();
    expect(() => product.requireVariant("var_1")).not.toThrow();
    expect(() => product.requireVariant("var_dautrui")).toThrow(VariantNotFoundError);
  });

  it("se reconstitue à l’identique depuis son instantané", () => {
    const snapshot = open().snapshot();
    expect(Product.reconstitute(snapshot).snapshot()).toEqual(snapshot);
  });
});
