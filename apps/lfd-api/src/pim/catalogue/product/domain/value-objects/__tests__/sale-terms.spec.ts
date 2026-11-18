import { InvalidSaleTermsError } from "../../errors/sale-unit-errors.js";
import { PIECE_SALE_TERMS, SALE_UNITS, saleTerms, type SaleTerms } from "../sale-terms.js";

describe("saleTerms — comment une déclinaison se vend", () => {
  it("connaît deux unités, la pièce et le poids", () => {
    expect(SALE_UNITS).toEqual(["piece", "weight"]);
  });

  it("lit la vente à la pièce sans pas ni minimum", () => {
    expect(saleTerms({ saleUnit: "piece", weightMinGrams: null, weightStepGrams: null })).toEqual(
      PIECE_SALE_TERMS,
    );
  });

  it("refuse un pas ou un minimum posé sur une pièce, plutôt que de les effacer", () => {
    expect(() =>
      saleTerms({ saleUnit: "piece", weightMinGrams: null, weightStepGrams: 50 }),
    ).toThrow(InvalidSaleTermsError);
    expect(() =>
      saleTerms({ saleUnit: "piece", weightMinGrams: 100, weightStepGrams: null }),
    ).toThrow(/Vendre au poids/u);
  });

  it("lit une vente au poids complète", () => {
    expect(saleTerms({ saleUnit: "weight", weightMinGrams: 200, weightStepGrams: 50 })).toEqual({
      saleUnit: "weight",
      weightMinGrams: 200,
      weightStepGrams: 50,
    });
  });

  it("laisse manquer le pas et le minimum au poids : l'activation les réclame, pas l'enregistrement", () => {
    expect(saleTerms({ saleUnit: "weight", weightMinGrams: null, weightStepGrams: null })).toEqual({
      saleUnit: "weight",
      weightMinGrams: null,
      weightStepGrams: null,
    });
  });

  it("refuse un pas ou un minimum nul, négatif ou fractionnaire — en nommant lequel", () => {
    for (const bad of [0, -50, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        saleTerms({ saleUnit: "weight", weightMinGrams: null, weightStepGrams: bad }),
      ).toThrow(/le pas/u);
      expect(() =>
        saleTerms({ saleUnit: "weight", weightMinGrams: bad, weightStepGrams: null }),
      ).toThrow(/le minimum/u);
    }
  });

  it("refuse une unité inconnue", () => {
    // Une chaîne large, comme celle d'un JSON : la frontière de forme ne la type pas.
    const rawUnit: string = "litre";
    const unknown = { saleUnit: rawUnit, weightMinGrams: null, weightStepGrams: null } as SaleTerms;
    expect(() => saleTerms(unknown)).toThrow(/litre/u);
  });
});
