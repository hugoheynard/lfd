import { transferPackingPiecesSchema } from "../packing-containers.js";

describe("transferPackingPiecesSchema — déplacer entre deux contenants", () => {
  it("accepte un contenant d'arrivée et un entier", () => {
    expect(transferPackingPiecesSchema.parse({ toContainerId: "ctn_2", quantity: 18 })).toEqual({
      toContainerId: "ctn_2",
      quantity: 18,
    });
  });

  it("refuse un contenant d'arrivée vide, une fraction, ou un champ inconnu", () => {
    expect(transferPackingPiecesSchema.safeParse({ toContainerId: "", quantity: 1 }).success).toBe(
      false,
    );
    expect(
      transferPackingPiecesSchema.safeParse({ toContainerId: "c", quantity: 1.5 }).success,
    ).toBe(false);
    expect(
      transferPackingPiecesSchema.safeParse({ toContainerId: "c", quantity: 1, sku: "X" }).success,
    ).toBe(false);
  });
});
