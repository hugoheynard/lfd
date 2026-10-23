import { isBatchDepositable } from "../collection-batch-depositability.js";

describe("isBatchDepositable — le lot partirait-il tel quel ?", () => {
  it("une ligne au moins, aucune société sans mandat : oui", () => {
    expect(isBatchDepositable(1, [])).toBe(true);
  });

  it("aucune ligne : non", () => {
    expect(isBatchDepositable(0, [])).toBe(false);
  });

  it("une société sans mandat nommée : non, même avec des lignes (Q2)", () => {
    expect(isBatchDepositable(3, ["Boulangerie du Port"])).toBe(false);
  });
});
