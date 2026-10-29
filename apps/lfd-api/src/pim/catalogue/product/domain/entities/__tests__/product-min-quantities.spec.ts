import type { SalesContext } from "../../../../../sales-contexts/domain/value-objects/sales-context.js";
import { bareVariant, tarte } from "../../../application/__tests__/audience-doubles.js";
import {
  DefaultVariantCannotFollowMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../../errors/min-quantity-errors.js";
import { ProductUnknownContextError, VariantNotFoundError } from "../../errors/product-errors.js";
import { Product } from "../product.js";

/**
 * **La quantité minimale, par déclinaison** (`plan-quantite-minimale.md`, M1) :
 * l'agrégat refuse le contexte inconnu, le défaut qui se suivrait et l'article
 * au poids ; son instantané résout l'héritage.
 */

const CONTEXTS: readonly SalesContext[] = ["takeaway", "eatIn", "b2b"].map((key, position) => ({
  id: `ctx_${key}`,
  key,
  label: key,
  active: true,
  position,
}));

const DEFAULT_ID = "prd_tarte_v1";
const SECOND_ID = "prd_tarte_v2";

function product(second: Parameters<typeof bareVariant>[0] = {}): Product {
  return Product.reconstitute(
    tarte({
      variants: [
        bareVariant(),
        bareVariant({ id: SECOND_ID, sku: "PAT-7-2", isDefault: false, position: 1, ...second }),
      ],
    }),
  );
}

function resolved(subject: Product, id: string) {
  return subject.snapshot().variants.find((variant) => variant.id === id);
}

describe("Product.changeMinQuantities", () => {
  it("pose la grille de la déclinaison, et la dit changée", () => {
    const subject = product();

    const changed = subject.changeMinQuantities(
      DEFAULT_ID,
      { pro: { b2b: 6 }, public: { takeaway: 2 } },
      CONTEXTS,
    );

    expect(changed).toBe(true);
    expect(resolved(subject, DEFAULT_ID)?.minQuantities).toEqual({
      pro: { b2b: 6 },
      public: { takeaway: 2 },
    });
  });

  it("ne dit rien changé quand la grille est la même", () => {
    const subject = product();
    subject.changeMinQuantities(DEFAULT_ID, { pro: { b2b: 6 }, public: {} }, CONTEXTS);

    expect(subject.changeMinQuantities(DEFAULT_ID, { pro: { b2b: 6 }, public: {} }, CONTEXTS)).toBe(
      false,
    );
  });

  it("refuse un contexte que le registre ne connaît pas", () => {
    expect(() =>
      product().changeMinQuantities(DEFAULT_ID, { pro: {}, public: { brunch: 2 } }, CONTEXTS),
    ).toThrow(ProductUnknownContextError);
  });

  it("refuse une déclinaison d'un autre produit", () => {
    expect(() =>
      product().changeMinQuantities("prd_autre_v1", { pro: {}, public: {} }, CONTEXTS),
    ).toThrow(VariantNotFoundError);
  });

  it("refuse que le défaut suive son propre minimum", () => {
    expect(() => product().changeMinQuantities(DEFAULT_ID, "follow", CONTEXTS)).toThrow(
      DefaultVariantCannotFollowMinQuantityError,
    );
  });

  it("une autre déclinaison qui suit sert la grille du défaut, et garde la sienne en dormance", () => {
    const subject = product({ minQuantities: { pro: { b2b: 12 }, public: {} } });
    subject.changeMinQuantities(DEFAULT_ID, { pro: { b2b: 6 }, public: {} }, CONTEXTS);

    expect(subject.changeMinQuantities(SECOND_ID, "follow", CONTEXTS)).toBe(true);

    expect(resolved(subject, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: true,
      minQuantities: { pro: { b2b: 6 }, public: {} },
    });
    const own = subject.persistenceSnapshot().variants.find((v) => v.id === SECOND_ID);
    expect(own?.minQuantities).toEqual({ pro: { b2b: 12 }, public: {} });
  });

  it("poser une grille cesse de suivre", () => {
    const subject = product({ minQuantityFollowsDefault: true });

    subject.changeMinQuantities(SECOND_ID, { pro: {}, public: { takeaway: 3 } }, CONTEXTS);

    expect(resolved(subject, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: false,
      minQuantities: { pro: {}, public: { takeaway: 3 } },
    });
  });

  describe("au poids", () => {
    const byWeight = { saleUnit: "weight" as const, weightStepGrams: 50 };

    it("refuse une grille en pièces", () => {
      expect(() =>
        product(byWeight).changeMinQuantities(
          SECOND_ID,
          { pro: {}, public: { takeaway: 2 } },
          CONTEXTS,
        ),
      ).toThrow(MinQuantityOnWeightSaleError);
    });

    it("refuse de suivre le minimum en pièces du défaut", () => {
      expect(() => product(byWeight).changeMinQuantities(SECOND_ID, "follow", CONTEXTS)).toThrow(
        MinQuantityOnWeightSaleError,
      );
    });

    it("accepte la grille vide", () => {
      expect(
        product(byWeight).changeMinQuantities(SECOND_ID, { pro: {}, public: {} }, CONTEXTS),
      ).toBe(false);
    });

    /** Une grille posée à la pièce ne survit pas au passage au poids. */
    it("ne sert jamais de minimum en pièces, même hérité d'avant", () => {
      const subject = product({
        ...byWeight,
        minQuantities: { pro: { b2b: 4 }, public: {} },
      });

      expect(resolved(subject, SECOND_ID)?.minQuantities).toEqual({ pro: {}, public: {} });
    });
  });
});
