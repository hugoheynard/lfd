import { MAX_LINE_WEIGHT_GRAMS } from "@lfd/contracts";

import {
  SaleUnitMismatchError,
  WeightAboveGuardError,
  WeightArticleWithoutStepError,
  WeightBelowMinimumError,
  WeightOffStepError,
} from "../../errors/sale-quantity-errors.js";
import { type ArticleSaleTerms, ensureSaleQuantity } from "../sale-quantity-rules.js";

/** Du saumon gravlax : au poids, par 100 g, à partir de 200 g. */
const SALMON: ArticleSaleTerms = {
  sku: "SAU-001",
  saleUnit: "weight",
  weightMinGrams: 200,
  weightStepGrams: 100,
};

const CROISSANT: ArticleSaleTerms = {
  sku: "VIE-001",
  saleUnit: "piece",
  weightMinGrams: null,
  weightStepGrams: null,
};

describe("ensureSaleQuantity — une quantité dans l'unité de l'article", () => {
  it("accepte un poids au pas, au-dessus du minimum", () => {
    expect(() => ensureSaleQuantity(SALMON, { quantity: 1_200, saleUnit: "weight" })).not.toThrow();
    expect(() => ensureSaleQuantity(SALMON, { quantity: 200, saleUnit: "weight" })).not.toThrow();
  });

  it("accepte des pièces pour un article à la pièce, sans autre règle ici", () => {
    expect(() => ensureSaleQuantity(CROISSANT, { quantity: 12, saleUnit: "piece" })).not.toThrow();
  });

  it("refuse un poids qui ne tombe pas sur le pas, et propose les deux voisins", () => {
    const refusal = () => ensureSaleQuantity(SALMON, { quantity: 1_250, saleUnit: "weight" });

    expect(refusal).toThrow(WeightOffStepError);
    expect(refusal).toThrow("1,25 kg de SAU-001");
    expect(refusal).toThrow("par 100 g. Choisissez 1,2 kg ou 1,3 kg.");
  });

  it("refuse un poids sous le minimum, dit en grammes", () => {
    expect(() => ensureSaleQuantity(SALMON, { quantity: 100, saleUnit: "weight" })).toThrow(
      new WeightBelowMinimumError("SAU-001", 100, 200),
    );
    expect(() => ensureSaleQuantity(SALMON, { quantity: 100, saleUnit: "weight" })).toThrow(
      "à partir de 200 g",
    );
  });

  it("n'exige aucun minimum quand l'article n'en pose pas", () => {
    const noMinimum = { ...SALMON, weightMinGrams: null };

    expect(() =>
      ensureSaleQuantity(noMinimum, { quantity: 100, saleUnit: "weight" }),
    ).not.toThrow();
  });

  it("refuse au-delà d'une tonne — une garde contre le zéro de trop, dite en kilos", () => {
    const tooMuch = MAX_LINE_WEIGHT_GRAMS + 100;
    const refusal = () => ensureSaleQuantity(SALMON, { quantity: tooMuch, saleUnit: "weight" });

    expect(refusal).toThrow(WeightAboveGuardError);
    expect(refusal).toThrow("plus de 1000 kg");
    expect(() =>
      ensureSaleQuantity(SALMON, { quantity: MAX_LINE_WEIGHT_GRAMS, saleUnit: "weight" }),
    ).not.toThrow();
  });

  it("refuse une unité discordante dans les deux sens, sans jamais convertir", () => {
    expect(() => ensureSaleQuantity(SALMON, { quantity: 3, saleUnit: "piece" })).toThrow(
      SaleUnitMismatchError,
    );
    expect(() => ensureSaleQuantity(CROISSANT, { quantity: 500, saleUnit: "weight" })).toThrow(
      SaleUnitMismatchError,
    );
  });

  it("refuse un article au poids sans pas — une fiche incomplète, pas un pas d'un gramme", () => {
    const noStep = { ...SALMON, weightStepGrams: null };

    expect(() => ensureSaleQuantity(noStep, { quantity: 500, saleUnit: "weight" })).toThrow(
      WeightArticleWithoutStepError,
    );
  });
});
