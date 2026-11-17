import type { ProductionBatchSnapshot } from "../../../../day/index.js";
import { correctableOf, outputCorrectionOf } from "../output-correction.js";

/**
 * La répartition d'une correction de déclaration (
 * `fournil/les-niveaux-de-suivi.md`). Les instants ne sont
 * comparés qu'entre eux : ils ne disent que l'ordre de sortie.
 */
function batch(
  id: string,
  quantity: number,
  extra: Partial<Pick<ProductionBatchSnapshot, "returned" | "pendingReturn" | "corrected">> = {},
): ProductionBatchSnapshot {
  return {
    id,
    sku: "CRO",
    quantity,
    recorded: {
      at: new Date(Date.UTC(2026, 0, 1, Number(id.slice(1)))),
      by: "staff",
      initials: "",
    },
    cancelled: null,
    returned: 0,
    pendingReturn: 0,
    corrected: 0,
    ...extra,
  };
}

/** Tout remis : la part remise vaut la fournée. */
function allHanded(batches: readonly ProductionBatchSnapshot[]): ReadonlyMap<string, number> {
  return new Map(batches.map((one) => [one.id, one.quantity]));
}

describe("outputCorrectionOf", () => {
  it("prend sur les fournées les plus récentes d'abord", () => {
    const line = [batch("b1", 50), batch("b2", 30), batch("b3", 20)];

    const result = outputCorrectionOf(line, allHanded(line), 40);

    expect(result).toEqual({
      corrections: [
        { batchId: "b3", corrected: 20, totalCorrected: 20 },
        { batchId: "b2", corrected: 20, totalCorrected: 20 },
      ],
      uncorrected: 0,
    });
  });

  it("saute une fournée qui a un retour en attente", () => {
    const line = [batch("b1", 50), batch("b2", 30, { pendingReturn: 10 })];

    const result = outputCorrectionOf(line, allHanded(line), 25);

    expect(result.corrections).toEqual([{ batchId: "b1", corrected: 25, totalCorrected: 25 }]);
  });

  it("borne chaque fournée à remis − rendu − corrigé déjà", () => {
    const line = [batch("b1", 50, { returned: 10, corrected: 15 })];

    const result = outputCorrectionOf(line, allHanded(line), 40);

    expect(result).toEqual({
      corrections: [{ batchId: "b1", corrected: 25, totalCorrected: 40 }],
      uncorrected: 15,
    });
  });

  it("ne touche jamais la part gardée sur place : seule la part remise compte", () => {
    const line = [batch("b1", 50)];

    const result = outputCorrectionOf(line, new Map([["b1", 20]]), 30);

    expect(result).toEqual({
      corrections: [{ batchId: "b1", corrected: 20, totalCorrected: 20 }],
      uncorrected: 10,
    });
  });

  it("une fournée jamais remise n'a rien à corriger, et le reste se dit", () => {
    const line = [batch("b1", 50)];

    expect(outputCorrectionOf(line, new Map(), 12)).toEqual({ corrections: [], uncorrected: 12 });
  });

  it("un écart nul ou négatif ne corrige rien", () => {
    const line = [batch("b1", 50)];

    expect(outputCorrectionOf(line, allHanded(line), 0)).toEqual({
      corrections: [],
      uncorrected: 0,
    });
    expect(outputCorrectionOf(line, allHanded(line), -3).uncorrected).toBe(0);
  });
});

describe("correctableOf", () => {
  it("vaut zéro sur une fournée annulée", () => {
    const cancelled = { ...batch("b1", 10), cancelled: { at: new Date(0), by: "staff" } };

    expect(correctableOf(cancelled, 10)).toBe(0);
  });
});
