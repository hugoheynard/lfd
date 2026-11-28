import { CounterPayerDirectDebitRefusedError } from "../../errors/collection-means-errors.js";
import { ensureMeansAllowedFor } from "../collection-means-payer.js";

const COUNTER = {
  companyId: "cmp_kiosk",
  name: "Kiosque du Quai",
  active: false,
  public: false,
  counterOpened: true,
  follows: [],
};

describe("un compte ouvert au comptoir règle par virement (K2, § 3.2)", () => {
  it("refuse le prélèvement, en disant de convertir d'abord", () => {
    expect(() => ensureMeansAllowedFor(COUNTER, "sepa_debit")).toThrow(
      CounterPayerDirectDebitRefusedError,
    );
    expect(() => ensureMeansAllowedFor(COUNTER, "sepa_debit")).toThrow(/Convertissez d'abord/u);
  });

  it("admet le virement", () => {
    expect(() => ensureMeansAllowedFor(COUNTER, "bank_transfer")).not.toThrow();
  });

  it("un compte converti retrouve le prélèvement", () => {
    expect(() =>
      ensureMeansAllowedFor({ ...COUNTER, counterOpened: false }, "sepa_debit"),
    ).not.toThrow();
  });
});
