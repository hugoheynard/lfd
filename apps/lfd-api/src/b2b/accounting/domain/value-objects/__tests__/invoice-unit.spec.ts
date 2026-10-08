import { UnknownInvoiceUnitError } from "../../errors/invoice-issuance-errors.js";
import { InvoiceUnit, PIECE_UNIT } from "../invoice-unit.js";

describe("InvoiceUnit", () => {
  it("admet la pièce et le kilogramme, avec leur libellé", () => {
    expect(InvoiceUnit.of("H87").label).toBe("pièce");
    expect(InvoiceUnit.of(" KGM ").code).toBe("KGM");
    expect(InvoiceUnit.of("KGM").label).toBe("kilogramme");
  });

  it("la pièce est l'unité d'aujourd'hui", () => {
    expect(InvoiceUnit.piece().code).toBe("H87");
    expect(PIECE_UNIT).toBe("H87");
  });

  it("refuse tout autre code, en le nommant", () => {
    for (const raw of ["C62", "h87", "", "KG"]) {
      expect(() => InvoiceUnit.of(raw)).toThrow(UnknownInvoiceUnitError);
    }
    expect(() => InvoiceUnit.of("LTR")).toThrow(/« LTR »/u);
  });
});
