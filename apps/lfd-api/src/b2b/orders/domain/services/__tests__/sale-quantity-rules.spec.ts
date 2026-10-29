import { MAX_LINE_WEIGHT_GRAMS } from "@lfd/contracts";

import {
  QuantityBelowMinimumError,
  SaleUnitMismatchError,
  WeightAboveGuardError,
  WeightArticleWithoutStepError,
  WeightBelowMinimumError,
  WeightOffStepError,
} from "../../errors/sale-quantity-errors.js";
import {
  type ArticleMinimumTerms,
  type ArticleSaleTerms,
  ensureMinimumQuantity,
  ensureSaleQuantity,
} from "../sale-quantity-rules.js";

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

/** Le croissant, par 6 au moins pour la clientèle servie. */
const CROISSANT_BY_SIX: ArticleMinimumTerms = {
  sku: "VIE-001",
  name: "Croissant",
  saleUnit: "piece",
  minQuantity: 6,
};

describe("ensureMinimumQuantity — le minimum d'achat en pièces", () => {
  it("accepte le minimum et au-delà", () => {
    expect(() => ensureMinimumQuantity(CROISSANT_BY_SIX, 6)).not.toThrow();
    expect(() => ensureMinimumQuantity(CROISSANT_BY_SIX, 40)).not.toThrow();
  });

  it("refuse en dessous, en nommant l'article, le minimum et le geste", () => {
    const refusal = () => ensureMinimumQuantity(CROISSANT_BY_SIX, 5);

    expect(refusal).toThrow(QuantityBelowMinimumError);
    expect(refusal).toThrow(/Croissant \(VIE-001\).*6 pièces au moins.*en demande 5/);
    expect(refusal).toThrow(/Commandez au moins 6 pièces, ou retirez la ligne/);
  });

  it("le refus est un 409 : la quantité est bien formée, la règle de vente la refuse", () => {
    expect(new QuantityBelowMinimumError("VIE-001", "Croissant", 5, 6)).toMatchObject({
      code: "orders.line.quantity_below_minimum",
      category: "business",
    });
  });

  it("ne dit rien sans minimum", () => {
    expect(() =>
      ensureMinimumQuantity({ ...CROISSANT_BY_SIX, minQuantity: null }, 1),
    ).not.toThrow();
  });

  it("ne s'applique jamais à un article au poids, dont le minimum est en grammes", () => {
    expect(() =>
      ensureMinimumQuantity({ ...CROISSANT_BY_SIX, saleUnit: "weight" }, 1),
    ).not.toThrow();
  });
});
