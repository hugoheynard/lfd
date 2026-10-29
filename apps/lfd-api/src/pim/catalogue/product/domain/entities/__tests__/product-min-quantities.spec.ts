import { bareVariant, tarte } from "../../../application/__tests__/audience-doubles.js";
import {
  DefaultVariantCannotFollowMinQuantityError,
  MinQuantityOnWeightSaleError,
} from "../../errors/min-quantity-errors.js";
import { VariantNotFoundError } from "../../errors/product-errors.js";
import { Product } from "../product.js";

/**
 * **La quantité minimale, par déclinaison** (`plan-quantite-minimale.md`, M1) :
 * l'agrégat refuse le défaut qui se suivrait et l'article
 * au poids ; son instantané résout l'héritage.
 */

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
  it("pose la paire de la déclinaison, et la dit changée", () => {
    const subject = product();

    const changed = subject.changeMinQuantities(DEFAULT_ID, { pro: 6, public: 2 });

    expect(changed).toBe(true);
    expect(resolved(subject, DEFAULT_ID)?.minQuantities).toEqual({ pro: 6, public: 2 });
  });

  it("ne dit rien changé quand la paire est la même", () => {
    const subject = product();
    subject.changeMinQuantities(DEFAULT_ID, { pro: 6, public: null });

    expect(subject.changeMinQuantities(DEFAULT_ID, { pro: 6, public: null })).toBe(false);
  });

  it("refuse une déclinaison d'un autre produit", () => {
    expect(() =>
      product().changeMinQuantities("prd_autre_v1", { pro: null, public: null }),
    ).toThrow(VariantNotFoundError);
  });

  it("refuse que le défaut suive son propre minimum", () => {
    expect(() => product().changeMinQuantities(DEFAULT_ID, "follow")).toThrow(
      DefaultVariantCannotFollowMinQuantityError,
    );
  });

  it("une autre déclinaison qui suit sert la paire du défaut, et garde la sienne en dormance", () => {
    const subject = product({ minQuantities: { pro: 12, public: null } });
    subject.changeMinQuantities(DEFAULT_ID, { pro: 6, public: null });

    expect(subject.changeMinQuantities(SECOND_ID, "follow")).toBe(true);

    expect(resolved(subject, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: true,
      minQuantities: { pro: 6, public: null },
    });
    const own = subject.persistenceSnapshot().variants.find((v) => v.id === SECOND_ID);
    expect(own?.minQuantities).toEqual({ pro: 12, public: null });
  });

  it("poser une paire cesse de suivre", () => {
    const subject = product({ minQuantityFollowsDefault: true });

    subject.changeMinQuantities(SECOND_ID, { pro: null, public: 3 });

    expect(resolved(subject, SECOND_ID)).toMatchObject({
      minQuantityFollowsDefault: false,
      minQuantities: { pro: null, public: 3 },
    });
  });

  describe("au poids", () => {
    const byWeight = { saleUnit: "weight" as const, weightStepGrams: 50 };

    it("refuse une paire en pièces", () => {
      expect(() =>
        product(byWeight).changeMinQuantities(SECOND_ID, { pro: null, public: 2 }),
      ).toThrow(MinQuantityOnWeightSaleError);
    });

    it("refuse de suivre le minimum en pièces du défaut", () => {
      expect(() => product(byWeight).changeMinQuantities(SECOND_ID, "follow")).toThrow(
        MinQuantityOnWeightSaleError,
      );
    });

    it("accepte la paire vide", () => {
      expect(product(byWeight).changeMinQuantities(SECOND_ID, { pro: null, public: null })).toBe(
        false,
      );
    });

    /** Un minimum posé à la pièce ne survit pas au passage au poids. */
    it("ne sert jamais de minimum en pièces, même hérité d'avant", () => {
      const subject = product({
        ...byWeight,
        minQuantities: { pro: 4, public: null },
      });

      expect(resolved(subject, SECOND_ID)?.minQuantities).toEqual({ pro: null, public: null });
    });
  });
});
