import { returnableLineRegimeOf } from "../collection-return.js";

describe("returnableLineRegimeOf — ce que la ligne encaissait", () => {
  it("une facture au moins : invoices, même avec un arrêté", () => {
    expect(returnableLineRegimeOf(1, true)).toBe("invoices");
    expect(returnableLineRegimeOf(2, false)).toBe("invoices");
  });

  it("aucune facture, un arrêté : statement", () => {
    expect(returnableLineRegimeOf(0, true)).toBe("statement");
  });

  it("ni l'un ni l'autre : legacy (lot d'avant F3)", () => {
    expect(returnableLineRegimeOf(0, false)).toBe("legacy");
  });
});
