import { myInvoicesArchiveQuerySchema } from "../my-invoices-archive.js";

describe("la chaîne de requête du zip de « Mes factures »", () => {
  it("lit les filtres, ou une sélection d'ids séparés par des virgules", () => {
    expect(myInvoicesArchiveQuerySchema.parse({ year: "2026", month: "3" })).toEqual({
      year: 2026,
      month: 3,
    });
    expect(myInvoicesArchiveQuerySchema.parse({ ids: "inv_1,inv_2" })).toEqual({
      ids: ["inv_1", "inv_2"],
    });
    expect(myInvoicesArchiveQuerySchema.parse({})).toEqual({});
  });

  it("refuse les ids ET des filtres, jamais les deux", () => {
    expect(myInvoicesArchiveQuerySchema.safeParse({ ids: "inv_1", year: "2026" }).success).toBe(
      false,
    );
    expect(myInvoicesArchiveQuerySchema.safeParse({ ids: "inv_1", kind: "invoice" }).success).toBe(
      false,
    );
  });

  it("refuse un id vide ou mal formé, et un mois sans année", () => {
    expect(myInvoicesArchiveQuerySchema.safeParse({ ids: "" }).success).toBe(false);
    expect(myInvoicesArchiveQuerySchema.safeParse({ ids: "inv_1,,inv_2" }).success).toBe(false);
    expect(myInvoicesArchiveQuerySchema.safeParse({ ids: "inv 1" }).success).toBe(false);
    expect(myInvoicesArchiveQuerySchema.safeParse({ month: "3" }).success).toBe(false);
  });
});
