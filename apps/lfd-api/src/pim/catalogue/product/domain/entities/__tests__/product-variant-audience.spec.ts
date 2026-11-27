import { bareVariant, tarte } from "../../../shared/__tests__/audience-doubles.js";
import type { Audience } from "../../../../shared/domain/value-objects/audience.js";
import { effectiveAudience } from "../../../../shared/domain/value-objects/audience.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import {
  DefaultVariantOwnAudienceError,
  OwnAudienceVariantNotDefaultableError,
} from "../../errors/variant-audience-errors.js";
import { Sku } from "../../value-objects/sku.value-object.js";
import { Product } from "../product.js";

/**
 * **L'audience par déclinaison** (`plan-audience-par-declinaison.md`, A1–A4) :
 * héritage à trois niveaux, le défaut suit toujours sa fiche (A2), toute
 * audience est admise (A4), une déclinaison ajoutée naît `null`, et le détachement donne à
 * la fiche neuve l'audience propre de sa déclinaison sinon celle que la fiche
 * d'origine pose.
 */

const DEFAULT_ID = "prd_tarte_v1";
const FORMULA_ID = "prd_tarte_v2";

function twoVariants(
  options: {
    formula?: Audience | null;
    productAudience?: Audience | null;
  } = {},
): Product {
  return Product.reconstitute(
    tarte({
      audience: options.productAudience ?? null,
      variants: [
        bareVariant({ priceCents: 3_200 }),
        bareVariant({
          id: FORMULA_ID,
          sku: "PAT-7-2",
          name: { fr: "Formule" },
          isDefault: false,
          position: 1,
          audience: options.formula ?? null,
        }),
      ],
    }),
  );
}

/**
 * L'audience propre d'une déclinaison, lue dans l'instantané : la clé est
 * ABSENTE quand elle suit sa fiche (l'empreinte de révision ne bouge pas).
 */
function audienceOf(product: Product, variantId: string): Audience | null {
  const variant = product.persistenceSnapshot().variants.find((entry) => entry.id === variantId);
  if (variant === undefined) {
    throw new RangeError(`déclinaison inconnue : ${variantId}`);
  }
  return variant.audience ?? null;
}

function detachFormula(subject: Product): Product {
  return subject.detachVariant(FORMULA_ID, {
    id: "prd_neuf",
    sku: Sku.create("P-NEUF22"),
    defaultVariant: { id: "prd_neuf_v1", sku: Sku.create("P-NEUF22-1") },
  });
}

describe("effectiveAudience — trois niveaux", () => {
  it("la déclinaison gagne, puis la fiche, puis la famille", () => {
    expect(effectiveAudience("resupply", "public", "both")).toBe("resupply");
    expect(effectiveAudience(null, "public", "both")).toBe("public");
    expect(effectiveAudience(null, null, "both")).toBe("both");
  });

  it("une déclinaison peut être plus large que sa fiche (A4)", () => {
    expect(effectiveAudience("both", "pro", "pro")).toBe("both");
  });
});

describe("Product — audience d'une déclinaison", () => {
  it("une fiche naît avec un défaut qui suit la fiche", () => {
    const product = Product.open({
      id: "prod_1",
      sku: Sku.create("CHO-FLOR"),
      name: { fr: "Florentin" },
      kind: "daily",
      categoryId: "cat_1",
      defaultVariant: { id: "var_1", sku: Sku.create("CHO-FLOR-1"), name: { fr: "Florentin" } },
    });

    expect(product.persistenceSnapshot().variants[0]).not.toHaveProperty("audience");
  });

  it("pose l'audience de la seule déclinaison visée, et dit qu'elle a changé", () => {
    const product = twoVariants();

    expect(product.changeVariantAudience(FORMULA_ID, "resupply")).toBe(true);
    expect(audienceOf(product, FORMULA_ID)).toBe("resupply");
    expect(audienceOf(product, DEFAULT_ID)).toBeNull();
  });

  it("ne dit rien changé quand elle le disait déjà — pas de fait à journaliser", () => {
    expect(twoVariants({ formula: "resupply" }).changeVariantAudience(FORMULA_ID, "resupply")).toBe(
      false,
    );
    expect(twoVariants().changeVariantAudience(FORMULA_ID, null)).toBe(false);
  });

  it("se remet sur la fiche avec `null`", () => {
    const product = twoVariants({ formula: "pro" });

    expect(product.changeVariantAudience(FORMULA_ID, null)).toBe(true);
    expect(audienceOf(product, FORMULA_ID)).toBeNull();
  });

  it("refuse la déclinaison d'une autre fiche", () => {
    expect(() => twoVariants().changeVariantAudience("ailleurs", "pro")).toThrow(
      VariantNotFoundError,
    );
  });

  it("garde la valeur à la reconstitution, et une ligne relue sans elle suit la fiche", () => {
    const reread = Product.reconstitute(twoVariants({ formula: "pro" }).persistenceSnapshot());
    expect(audienceOf(reread, FORMULA_ID)).toBe("pro");
    expect(audienceOf(Product.reconstitute(tarte()), DEFAULT_ID)).toBeNull();
  });
});

describe("Product — le défaut suit sa fiche, la déclinaison demande les vignettes", () => {
  it("A2 : refuse une audience sur le défaut, sans rien muter", () => {
    const product = twoVariants();

    expect(() => product.changeVariantAudience(DEFAULT_ID, "pro")).toThrow(
      DefaultVariantOwnAudienceError,
    );
    expect(audienceOf(product, DEFAULT_ID)).toBeNull();
  });

  it("A2 : refuse d'en faire le défaut tant qu'elle a sa propre audience", () => {
    const product = twoVariants({ formula: "resupply" });

    expect(() => product.makeVariantDefault(FORMULA_ID)).toThrow(
      OwnAudienceVariantNotDefaultableError,
    );
    expect(product.snapshot().variants.find((v) => v.isDefault)?.id).toBe(DEFAULT_ID);
  });

  it("A2 : la même bascule passe une fois la déclinaison remise sur la fiche", () => {
    const product = twoVariants({ formula: "resupply" });
    product.changeVariantAudience(FORMULA_ID, null);

    product.makeVariantDefault(FORMULA_ID);

    expect(product.snapshot().variants.find((v) => v.isDefault)?.id).toBe(FORMULA_ID);
  });

  it("une restauration garde l'audience propre", () => {
    const product = twoVariants({ formula: "resupply" });
    product.discontinueVariant(FORMULA_ID);

    product.restoreVariant(FORMULA_ID);

    expect(audienceOf(product, FORMULA_ID)).toBe("resupply");
  });
});

describe("Product — audience aux gestes de déclinaison", () => {
  it("une déclinaison ajoutée naît sans audience propre", () => {
    const product = twoVariants({ productAudience: "pro" });
    const added = product.addVariant({
      id: "v3",
      sku: Sku.create("PAT-7-3"),
      name: { fr: "Part" },
      options: {},
    });

    expect(added.snapshot()).not.toHaveProperty("audience");
  });

  it("un détachement donne à la fiche neuve l'audience propre de sa déclinaison", () => {
    const born = detachFormula(twoVariants({ formula: "resupply", productAudience: "public" }));

    expect(born.audience).toBe("resupply");
    expect(born.snapshot().variants[0]).not.toHaveProperty("audience");
  });

  it("sinon celle que la fiche d'origine pose, `null` compris — jamais l'effective", () => {
    expect(detachFormula(twoVariants({ productAudience: "pro" })).audience).toBe("pro");
    expect(detachFormula(twoVariants()).audience).toBeNull();
  });
});
