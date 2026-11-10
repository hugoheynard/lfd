import { InvalidBankReturnReasonError } from "../../errors/collection-return-errors.js";
import { BankReturnReason, normalizedFileReason } from "../bank-return-reason.js";

describe("le motif d'un retour bancaire", () => {
  it("dit ses mots, et propose de révoquer pour un motif de mandat", () => {
    const noMandate = BankReturnReason.of("reject", "MD01", null);
    const empty = BankReturnReason.of("return", "AM04", null);

    expect(noMandate.description).toBe("Pas de mandat");
    expect(noMandate.proposesRevocation).toBe(true);
    expect(empty.proposesRevocation).toBe(false);
  });

  it("admet « autre » avec ses mots, rognés", () => {
    const other = BankReturnReason.of("reject", "NARR", `  ${"x".repeat(200)}  `);

    expect(other.label).toHaveLength(140);
    expect(other.description).toBe(other.label);
  });

  it("refuse un code mal formé", () => {
    expect(() => BankReturnReason.of("reject", "am04", null)).toThrow(InvalidBankReturnReasonError);
  });

  it("un code de fichier hors liste devient « autre », code en tête", () => {
    expect(normalizedFileReason("reject", "ZZ99", "Refus interne")).toEqual({
      code: "NARR",
      label: "Code ZZ99 : Refus interne",
    });
    expect(normalizedFileReason("return", "AM04", null)).toEqual({ code: "AM04", label: null });
  });
});
