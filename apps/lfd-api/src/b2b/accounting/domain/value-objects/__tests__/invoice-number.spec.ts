import { InvalidInvoiceNumberError } from "../../errors/invoice-errors.js";
import { InvoiceNumber } from "../invoice-number.js";

describe("InvoiceNumber", () => {
  it("s'écrit FA-<année>-<rang sur six chiffres>", () => {
    expect(InvoiceNumber.compose(2026, 123).value).toBe("FA-2026-000123");
  });

  it("se relit tel qu'imprimé", () => {
    const number = InvoiceNumber.parse(" FA-2026-000123 ");
    expect([number.year, number.sequence]).toEqual([2026, 123]);
    expect(number.equals(InvoiceNumber.compose(2026, 123))).toBe(true);
  });

  it.each(["FA-2026-123", "FV-2026-000123", "FA-26-000123", "FA-2026-0001234", ""])(
    "refuse la forme « %s »",
    (raw) => {
      expect(() => InvoiceNumber.parse(raw)).toThrow(InvalidInvoiceNumberError);
    },
  );

  it("refuse le rang 0 : une séquence commence à 1", () => {
    expect(() => InvoiceNumber.parse("FA-2026-000000")).toThrow(InvalidInvoiceNumberError);
  });

  it.each([
    [2026, 1_000_000],
    [2026, 1.5],
    [-1, 1],
    [1999, 1],
  ])("refuse l'année %d et le rang %d", (year, sequence) => {
    expect(() => InvoiceNumber.compose(year, sequence)).toThrow(InvalidInvoiceNumberError);
  });
});
