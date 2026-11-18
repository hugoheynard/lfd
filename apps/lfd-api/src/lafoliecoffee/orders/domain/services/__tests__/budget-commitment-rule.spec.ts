import {
  BudgetCommitmentNumberRequiredError,
  BudgetCommitmentServiceCodeRequiredError,
  PrivatePayerBudgetCommitmentError,
} from "../../errors/budget-commitment-errors.js";
import {
  budgetCommitmentFor,
  PRIVATE_PAYER,
  type PayerCommitmentTerms,
} from "../budget-commitment-rule.js";

const PUBLIC = (over: Partial<Extract<PayerCommitmentTerms, { kind: "public" }>> = {}) =>
  ({
    kind: "public",
    commitmentRequired: false,
    serviceCodeRequired: false,
    defaultServiceCode: "",
    ...over,
  }) as const;

describe("budgetCommitmentFor — la règle de la passation (E2′)", () => {
  it("numéro exigé et absent : refusé, avec la phrase du bon de commande", () => {
    expect(() => budgetCommitmentFor(null, PUBLIC({ commitmentRequired: true }))).toThrow(
      BudgetCommitmentNumberRequiredError,
    );
    expect(() =>
      budgetCommitmentFor({ number: "  ", serviceCode: "" }, PUBLIC({ commitmentRequired: true })),
    ).toThrow(/il figure sur son bon de commande/u);
  });

  it("numéro exigé et présent : gardé", () => {
    expect(
      budgetCommitmentFor(
        { number: "1300012345", serviceCode: "" },
        PUBLIC({ commitmentRequired: true }),
      ),
    ).toMatchObject({ number: "1300012345", serviceCode: "" });
  });

  it("code service : le saisi l'emporte, sinon le défaut de la fiche", () => {
    const terms = PUBLIC({ defaultServiceCode: "SERV-RH" });

    expect(budgetCommitmentFor({ number: "1", serviceCode: "SERV-LOG" }, terms)?.serviceCode).toBe(
      "SERV-LOG",
    );
    expect(budgetCommitmentFor({ number: "1", serviceCode: "" }, terms)?.serviceCode).toBe(
      "SERV-RH",
    );
    expect(budgetCommitmentFor(null, terms)).toMatchObject({ number: "", serviceCode: "SERV-RH" });
  });

  it("code exigé, ni saisi ni proposé : refusé", () => {
    expect(() =>
      budgetCommitmentFor({ number: "1", serviceCode: "" }, PUBLIC({ serviceCodeRequired: true })),
    ).toThrow(BudgetCommitmentServiceCodeRequiredError);
  });

  it("public sans exigence ni défaut, rien saisi : aucun engagement", () => {
    expect(budgetCommitmentFor(null, PUBLIC())).toBeNull();
  });

  it("payeur privé : rien saisi, rien porté ; un numéro ou un code envoyé est refusé", () => {
    expect(budgetCommitmentFor(null, PRIVATE_PAYER)).toBeNull();
    expect(budgetCommitmentFor({ number: "", serviceCode: "" }, PRIVATE_PAYER)).toBeNull();
    expect(() => budgetCommitmentFor({ number: "1", serviceCode: "" }, PRIVATE_PAYER)).toThrow(
      PrivatePayerBudgetCommitmentError,
    );
    expect(() => budgetCommitmentFor({ number: "", serviceCode: "S" }, PRIVATE_PAYER)).toThrow(
      PrivatePayerBudgetCommitmentError,
    );
  });
});
