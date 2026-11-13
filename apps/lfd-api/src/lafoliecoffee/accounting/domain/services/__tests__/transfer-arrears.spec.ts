import type { UnpaidTransferInvoice } from "../../ports/unpaid-transfer-invoices.reader.js";
import {
  daysLateOf,
  isTransferOverdue,
  transferArrearsOf,
  transferOverdueFrom,
} from "../transfer-arrears.js";

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
  it("échéance un jour ouvré : le jour même n'est pas un retard ; le lendemain en est un premier", () => {
    // Mercredi 18 novembre 2026.
    expect(daysLateOf("2026-11-18", "2026-11-17")).toBe(0);
    expect(daysLateOf("2026-11-18", "2026-11-18")).toBe(0);
    expect(daysLateOf("2026-11-18", "2026-11-19")).toBe(1);
    // Le passage à l'heure d'hiver ne décale pas le compte (samedi 24 → lundi 26).
    expect(daysLateOf("2026-10-24", "2026-10-26")).toBe(2);
  });

  describe("le retard n'est constaté qu'au premier jour ouvré qui SUIT l'échéance", () => {
    it("échéance un samedi : ni le samedi ni le dimanche, en retard le lundi", () => {
      // Samedi 14 novembre 2026.
      expect(transferOverdueFrom("2026-11-14")).toBe("2026-11-16");
      expect(isTransferOverdue("2026-11-14", "2026-11-15")).toBe(false);
      expect(daysLateOf("2026-11-14", "2026-11-15")).toBe(0);
      expect(isTransferOverdue("2026-11-14", "2026-11-16")).toBe(true);
      // Compté depuis l'échéance imprimée, pas depuis le constat.
      expect(daysLateOf("2026-11-14", "2026-11-16")).toBe(2);
    });

    it("échéance un vendredi : pas le week-end, en retard le lundi", () => {
      // Vendredi 13 novembre 2026.
      expect(transferOverdueFrom("2026-11-13")).toBe("2026-11-16");
      expect(isTransferOverdue("2026-11-13", "2026-11-14")).toBe(false);
      expect(isTransferOverdue("2026-11-13", "2026-11-15")).toBe(false);
      expect(daysLateOf("2026-11-13", "2026-11-16")).toBe(3);
    });

    it("échéance la veille d'un jour fermé : en retard au premier jour rouvert", () => {
      // Jeudi 24 décembre 2026 ; 25 fermé (TARGET2), 26 et 27 week-end.
      expect(transferOverdueFrom("2026-12-24")).toBe("2026-12-28");
      expect(isTransferOverdue("2026-12-24", "2026-12-25")).toBe(false);
      expect(isTransferOverdue("2026-12-24", "2026-12-27")).toBe(false);
      expect(isTransferOverdue("2026-12-24", "2026-12-28")).toBe(true);
      // Veille du Vendredi saint 2027 (26 mars) et du lundi de Pâques (29).
      expect(transferOverdueFrom("2027-03-25")).toBe("2027-03-30");
    });
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
