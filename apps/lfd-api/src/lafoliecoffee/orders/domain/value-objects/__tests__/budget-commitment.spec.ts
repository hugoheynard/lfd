import { InvalidBudgetCommitmentError } from "../../errors/budget-commitment-errors.js";
import { BudgetCommitment } from "../budget-commitment.js";

describe("BudgetCommitment — une forme large, jamais le format de l'État en dur", () => {
  it("garde un numéro d'État (10 caractères) et un code service", () => {
    const commitment = BudgetCommitment.entered({ number: "1300012345", serviceCode: "SERV-1" });

    expect([commitment?.number, commitment?.serviceCode]).toEqual(["1300012345", "SERV-1"]);
  });

  it("admet le numéro d'une collectivité, avec lettres, tirets et barres", () => {
    expect(
      BudgetCommitment.entered({ number: "BC-2026/0042 mairie", serviceCode: "" })?.number,
    ).toBe("BC-2026/0042 mairie");
  });

  it("retire les espaces de tête et de queue", () => {
    expect(BudgetCommitment.entered({ number: "  42  ", serviceCode: " S " })).toMatchObject({
      number: "42",
      serviceCode: "S",
    });
  });

  it("deux champs vides : pas d'engagement", () => {
    expect(BudgetCommitment.entered({ number: " ", serviceCode: "" })).toBeNull();
    expect(BudgetCommitment.stored(null, null)).toBeNull();
  });

  it("refuse un numéro de plus de 50 caractères", () => {
    expect(() => BudgetCommitment.entered({ number: "1".repeat(51), serviceCode: "" })).toThrow(
      InvalidBudgetCommitmentError,
    );
    expect(
      BudgetCommitment.entered({ number: "1".repeat(50), serviceCode: "" })?.number,
    ).toHaveLength(50);
  });

  it("refuse un caractère non imprimable", () => {
    expect(() => BudgetCommitment.entered({ number: "13\n00", serviceCode: "" })).toThrow(
      /n'est pas imprimable/u,
    );
    expect(() => BudgetCommitment.entered({ number: "", serviceCode: "S\u0007" })).toThrow(
      InvalidBudgetCommitmentError,
    );
  });

  it("refuse un code service de plus de 100 caractères", () => {
    expect(() => BudgetCommitment.entered({ number: "", serviceCode: "S".repeat(101) })).toThrow(
      /au plus 100 caractères/u,
    );
  });

  it("compare numéro et code", () => {
    const a = BudgetCommitment.entered({ number: "1", serviceCode: "S" });
    expect(a?.sameAs(BudgetCommitment.entered({ number: "1", serviceCode: "S" }))).toBe(true);
    expect(a?.sameAs(BudgetCommitment.entered({ number: "1", serviceCode: "T" }))).toBe(false);
    expect(a?.sameAs(null)).toBe(false);
  });
});
