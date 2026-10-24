import {
  deliveryDayMissing,
  invoicesStatus,
  procedureOrderStatus,
  type InvoicesFacts,
  type ProcedureOrderFacts,
} from "../collection-procedure-invoices.js";

const FACTS: InvoicesFacts = { reached: true, open: true, statuses: [] };

const NOTHING: ProcedureOrderFacts = { invoiced: false, handedOver: false, receivedOn: null };

describe("le statut d'une commande de la période", () => {
  it("aucune remise enregistrée : réception à confirmer", () => {
    expect(procedureOrderStatus(NOTHING)).toBe("receipt_to_confirm");
    expect(deliveryDayMissing(NOTHING)).toBe(false);
  });

  it("remise enregistrée, jour posé, pas de facture : réception confirmée", () => {
    const facts = { ...NOTHING, handedOver: true, receivedOn: "2026-10-12" };
    expect(procedureOrderStatus(facts)).toBe("receipt_confirmed");
    expect(deliveryDayMissing(facts)).toBe(false);
  });

  it("un jour de réception posé sans snapshot de retrait vaut remise enregistrée", () => {
    expect(procedureOrderStatus({ ...NOTHING, receivedOn: "2026-10-12" })).toBe(
      "receipt_confirmed",
    );
  });

  it("facturée : l'emporte sur tout", () => {
    expect(
      procedureOrderStatus({ invoiced: true, handedOver: true, receivedOn: "2026-10-12" }),
    ).toBe("invoiced");
  });

  /** Régression (dev, 2026-10-24) : une commande facturée avant la règle ZL, sans `received_on`, sortait « à constater ». */
  it("facturée sans jour de réception : facturée, jamais à confirmer", () => {
    const facts = { ...NOTHING, invoiced: true };
    expect(procedureOrderStatus(facts)).toBe("invoiced");
    expect(deliveryDayMissing(facts)).toBe(false);
  });

  it("remise enregistrée sans jour de réception : confirmée, jour manquant nommé", () => {
    const facts = { ...NOTHING, handedOver: true };
    expect(procedureOrderStatus(facts)).toBe("receipt_confirmed");
    expect(deliveryDayMissing(facts)).toBe(true);
  });
});

describe("l'état de l'onglet Factures de la procédure", () => {
  it("une clôture à venir est verrouillée, même avec des réceptions à confirmer", () => {
    expect(invoicesStatus({ ...FACTS, reached: false, statuses: ["receipt_to_confirm"] })).toEqual({
      state: "locked",
      reason: "not_yet_issuable",
    });
  });

  it("une clôture d'avant la mise en service : fait, rien à facturer", () => {
    expect(invoicesStatus({ ...FACTS, open: false, statuses: ["receipt_confirmed"] })).toEqual({
      state: "done",
      reason: "before_service",
    });
  });

  it("une réception à confirmer passe avant une réception à facturer", () => {
    expect(
      invoicesStatus({ ...FACTS, statuses: ["receipt_confirmed", "receipt_to_confirm"] }),
    ).toEqual({ state: "to_do", reason: "receipts_to_confirm" });
  });

  it("une réception confirmée non facturée : à faire", () => {
    expect(invoicesStatus({ ...FACTS, statuses: ["invoiced", "receipt_confirmed"] })).toEqual({
      state: "to_do",
      reason: "receipts_to_invoice",
    });
  });

  it("tout facturé, ou rien dans la période : fait", () => {
    expect(invoicesStatus({ ...FACTS, statuses: ["invoiced"] })).toEqual({
      state: "done",
      reason: "all_invoiced",
    });
    expect(invoicesStatus(FACTS)).toEqual({ state: "done", reason: "all_invoiced" });
  });
});
