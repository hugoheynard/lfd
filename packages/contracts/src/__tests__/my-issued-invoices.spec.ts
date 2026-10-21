import { myInvoicesQuerySchema } from "../my-issued-invoices.js";

describe("les filtres de « Mes factures »", () => {
  it("coerce l'année et le mois de la chaîne de requête", () => {
    expect(myInvoicesQuerySchema.parse({ year: "2026", month: "9", kind: "invoice" })).toEqual({
      year: 2026,
      month: 9,
      kind: "invoice",
    });
    expect(myInvoicesQuerySchema.parse({})).toEqual({});
  });

  it("refuse un mois hors de 1 à 12, un genre inconnu, un mois sans année", () => {
    expect(myInvoicesQuerySchema.safeParse({ year: "2026", month: "13" }).success).toBe(false);
    expect(myInvoicesQuerySchema.safeParse({ kind: "receipt" }).success).toBe(false);
    expect(myInvoicesQuerySchema.safeParse({ month: "9" }).success).toBe(false);
  });
});
