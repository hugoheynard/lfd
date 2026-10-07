import type { BoardOrder } from "../../ports/packing-board.reader.js";
import { coldOutsideIsotherm, type ColdPacking } from "../packing-board-sheet.js";

const COLD: ColdPacking = { coldSkus: new Set(["FLAN"]), isothermBinIds: new Set(["b_iso"]) };

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    orderId: "o1",
    reference: "CMD-1",
    customerLabel: "Café du Port",
    fulfillmentMethod: "delivery",
    clientele: "pro",
    drawnAt: new Date(0),
    packed: null,
    containers: 1,
    containerMode: "listed",
    lines: [
      { sku: "FLAN", productName: "Flan pâtissier", quantity: 2, packed: null },
      { sku: "PAIN", productName: "Pain", quantity: 4, packed: null },
    ],
    containerList: [],
    ...overrides,
  };
}

function bin(binId: string, skus: readonly string[]): BoardOrder["containerList"][number] {
  return {
    id: `c_${binId}`,
    nature: "bin",
    label: binId,
    bin: { binId, code: binId, half: null },
    lines: skus.map((sku) => ({ sku, quantity: 1 })),
  };
}

/**
 * Régression : depuis K3c (2026-10-05), une livraison avec du froid se
 * déclarait prête sans bac isotherme, sans un mot (audit livraisons, Q3).
 */
describe("coldOutsideIsotherm — le froid hors bac isotherme", () => {
  it("nomme le froid posé dans un bac sec", () => {
    expect(
      coldOutsideIsotherm(order({ containerList: [bin("b_dry", ["FLAN", "PAIN"])] }), COLD),
    ).toEqual(["Flan pâtissier"]);
  });

  it("nomme le froid posé dans un sac", () => {
    const bag = {
      id: "c_bag",
      nature: "bag" as const,
      label: "Sac 1",
      bin: null,
      lines: [{ sku: "FLAN", quantity: 2 }],
    };
    expect(coldOutsideIsotherm(order({ containerList: [bag] }), COLD)).toEqual(["Flan pâtissier"]);
  });

  it("ne dit rien quand le froid est dans l'isotherme, même si le sec est ailleurs", () => {
    const containerList = [bin("b_iso", ["FLAN"]), bin("b_dry", ["PAIN"])];
    expect(coldOutsideIsotherm(order({ containerList }), COLD)).toEqual([]);
  });

  it("ne dit rien pour un retrait, ni pour une commande colisée avec l'ancien poste", () => {
    const containerList = [bin("b_dry", ["FLAN"])];
    expect(
      coldOutsideIsotherm(order({ containerList, fulfillmentMethod: "pickup" }), COLD),
    ).toEqual([]);
    expect(coldOutsideIsotherm(order({ containerList, containerMode: "counted" }), COLD)).toEqual(
      [],
    );
  });
});
