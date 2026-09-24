import {
  DuplicateOperationSkuError,
  OperationSelectionTooLargeError,
} from "../../errors/operation-errors.js";
import { MAX_OPERATION_SKUS, OperationSelection } from "../operation-selection.js";

describe("OperationSelection", () => {
  it("garde l'ordre reçu, SKU rognés, blancs écartés", () => {
    expect(OperationSelection.of([" BUC-001", "", "GAL-002 ", "  "]).skus).toEqual([
      "BUC-001",
      "GAL-002",
    ]);
  });

  /** Deux places pour un même article : l'écran s'est trompé, on ne choisit pas pour lui. */
  it("refuse un SKU présent deux fois, en le nommant", () => {
    expect(() => OperationSelection.of(["BUC-001", "GAL-002", "BUC-001 "])).toThrow(
      DuplicateOperationSkuError,
    );
    expect(() => OperationSelection.of(["BUC-001", "BUC-001"])).toThrow(/BUC-001/u);
  });

  it("refuse au-delà de la borne, et l'accepte pile", () => {
    const skus = (count: number) => Array.from({ length: count }, (_, i) => `SKU-${String(i)}`);

    expect(OperationSelection.of(skus(MAX_OPERATION_SKUS)).skus).toHaveLength(MAX_OPERATION_SKUS);
    expect(() => OperationSelection.of(skus(MAX_OPERATION_SKUS + 1))).toThrow(
      OperationSelectionTooLargeError,
    );
  });

  it("commence vide", () => {
    expect(OperationSelection.empty().skus).toEqual([]);
  });
});
