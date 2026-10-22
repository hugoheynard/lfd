import { InvalidInvoiceNumberError } from "../../errors/invoice-errors.js";
import { InvoiceNumber } from "../invoice-number.js";

/** BR-FR-01 / BR-FR-02 sur BT-1 (Schematron BR-FR Flux 2 v1.4.0.04, `test/fixtures/facturx-fr/`). */
const BR_FR_MAX_LENGTH = 35;
const BR_FR_ALLOWED = /^[A-Za-z0-9+\-_/]+$/u;

describe("InvoiceNumber", () => {
  it("s'écrit FA-<préfixe>-<année>-<rang sur six chiffres>", () => {
    expect(InvoiceNumber.compose("LFD", 2026, 123).value).toBe("FA-LFD-2026-000123");
  });

  it("se relit tel qu'imprimé, préfixe compris", () => {
    const number = InvoiceNumber.parse(" FA-LFD-2026-000123 ");
    expect([number.prefix, number.year, number.sequence]).toEqual(["LFD", 2026, 123]);
    expect(number.equals(InvoiceNumber.compose("LFD", 2026, 123))).toBe(true);
  });

  it("distingue deux entités au même rang : le préfixe fait partie du numéro (F14)", () => {
    expect(
      InvoiceNumber.compose("LFD", 2026, 1).equals(InvoiceNumber.compose("LFC", 2026, 1)),
    ).toBe(false);
  });

  it.each([
    "FA-2026-000123",
    "FA-LFD-2026-123",
    "FV-LFD-2026-000123",
    "FA-LFD-26-000123",
    "FA-LFD-2026-0001234",
    "FA-L-2026-000123",
    "FA-LFDLFDX-2026-000123",
    "FA-lfd-2026-000123",
    "FA-LF1-2026-000123",
    "",
  ])("refuse la forme « %s »", (raw) => {
    expect(() => InvoiceNumber.parse(raw)).toThrow(InvalidInvoiceNumberError);
  });

  it("refuse le rang 0 : une séquence commence à 1", () => {
    expect(() => InvoiceNumber.parse("FA-LFD-2026-000000")).toThrow(InvalidInvoiceNumberError);
  });

  it.each([
    ["LFD", 2026, 1_000_000],
    ["LFD", 2026, 1.5],
    ["LFD", -1, 1],
    ["LFD", 1999, 1],
    ["", 2026, 1],
    ["É", 2026, 1],
    ["ABCDEFG", 2026, 1],
  ])("refuse le préfixe « %s », l'année %d et le rang %d", (prefix, year, sequence) => {
    expect(() => InvoiceNumber.compose(prefix, year, sequence)).toThrow(InvalidInvoiceNumberError);
  });

  it("tient BR-FR-01 et BR-FR-02 sur BT-1 au plus long : 35 caractères, alphanumérique et « - »", () => {
    const longest = InvoiceNumber.compose("ABCDEF", 9999, 999_999).value;
    expect(longest).toBe("FA-ABCDEF-9999-999999");
    expect(longest.length).toBeLessThanOrEqual(BR_FR_MAX_LENGTH);
    expect(longest).toMatch(BR_FR_ALLOWED);
  });
});
