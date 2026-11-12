import type { UnpaidTransferInvoice } from "../../ports/unpaid-transfer-invoices.reader.js";
import { daysLateOf, transferArrearsOf } from "../transfer-arrears.js";

// Jours comparés entre eux seulement : `today` est donné.
const unpaid = (over: Partial<UnpaidTransferInvoice> = {}): UnpaidTransferInvoice => ({
  invoiceId: "inv_1",
  number: "FA-LFD-2026-000001",
  legalEntityId: "le1",
  legalEntityName: "La Folie Douce",
  payerCompanyId: "cmp_port",
  payerName: "Boulangerie du Port",
  issuedOn: "2026-10-31",
  dueOn: "2026-11-14",
  remainingCents: 12_000,
  ...over,
});

describe("les impayés de factures au virement (V8)", () => {
  it("le jour de l'échéance n'est pas un retard ; le lendemain en est un premier", () => {
    expect(daysLateOf("2026-11-14", "2026-11-13")).toBe(0);
    expect(daysLateOf("2026-11-14", "2026-11-14")).toBe(0);
    expect(daysLateOf("2026-11-14", "2026-11-15")).toBe(1);
    // Le passage à l'heure d'hiver ne décale pas le compte.
    expect(daysLateOf("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("chaque facture porte son retard ; les plus en retard d'abord, puis par numéro", () => {
    const arrears = transferArrearsOf(
      [
        unpaid({ invoiceId: "inv_3", number: "FA-LFD-2026-000003", dueOn: "2026-11-30" }),
        unpaid({ invoiceId: "inv_2", number: "FA-LFD-2026-000002" }),
        unpaid(),
        unpaid({ invoiceId: "inv_0", number: "FA-LFD-2026-000000", dueOn: "2026-11-01" }),
      ],
      "2026-11-20",
    );

    expect(arrears.map((one) => [one.number, one.overdue, one.daysLate])).toEqual([
      ["FA-LFD-2026-000000", true, 19],
      ["FA-LFD-2026-000001", true, 6],
      ["FA-LFD-2026-000002", true, 6],
      ["FA-LFD-2026-000003", false, 0],
    ]);
  });
});
