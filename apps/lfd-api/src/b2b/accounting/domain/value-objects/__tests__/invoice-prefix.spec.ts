import { InvalidInvoicePrefixError } from "../../errors/invoice-errors.js";
import { InvoicePrefix } from "../invoice-prefix.js";

describe("InvoicePrefix", () => {
  it.each([
    ["LFD", "LFD"],
    ["  lfd ", "LFD"],
    ["AB", "AB"],
    ["ABCDEF", "ABCDEF"],
  ])("accepte « %s » et le relit « %s »", (raw, value) => {
    expect(InvoicePrefix.create(raw).value).toBe(value);
  });

  it.each(["", "A", "ABCDEFG", "LF1", "LF-D", "LÉD", "L D"])("refuse « %s »", (raw) => {
    expect(() => InvoicePrefix.create(raw)).toThrow(InvalidInvoicePrefixError);
  });

  it("nomme la forme attendue et un exemple dans son refus", () => {
    expect(() => InvoicePrefix.create("12")).toThrow(/2 à 6 lettres sans accent, par exemple LFD/u);
  });

  it("compare par valeur", () => {
    expect(InvoicePrefix.create("lfd").equals(InvoicePrefix.create("LFD"))).toBe(true);
  });
});
