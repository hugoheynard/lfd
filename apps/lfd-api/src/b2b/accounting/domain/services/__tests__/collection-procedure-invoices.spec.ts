import { invoicesStatus, type InvoicesFacts } from "../collection-procedure-invoices.js";

const FACTS: InvoicesFacts = {
  reached: true,
  open: true,
  missingOrderCount: 0,
  unconfirmedCount: 0,
};

describe("l'onglet Factures de la procédure", () => {
  it("une clôture à venir est verrouillée, même avec des bons à constater", () => {
    expect(invoicesStatus({ ...FACTS, reached: false, unconfirmedCount: 2 })).toEqual({
      state: "locked",
      reason: "not_yet_issuable",
    });
  });

  it("une clôture d'avant la mise en service n'a rien à facturer", () => {
    expect(invoicesStatus({ ...FACTS, open: false, missingOrderCount: 3 })).toEqual({
      state: "done",
      reason: "before_service",
    });
  });

  it("un bon de l'assiette sans facture : à faire", () => {
    expect(invoicesStatus({ ...FACTS, missingOrderCount: 1 })).toEqual({
      state: "to_do",
      reason: "missing_invoices",
    });
  });

  it("des bons à constater passent en premier : c'est le premier geste", () => {
    expect(invoicesStatus({ ...FACTS, missingOrderCount: 1, unconfirmedCount: 1 })).toEqual({
      state: "to_do",
      reason: "unconfirmed_deliveries",
    });
  });

  it("tout facturé, rien à constater : fait", () => {
    expect(invoicesStatus(FACTS)).toEqual({ state: "done", reason: "all_invoiced" });
  });
});
