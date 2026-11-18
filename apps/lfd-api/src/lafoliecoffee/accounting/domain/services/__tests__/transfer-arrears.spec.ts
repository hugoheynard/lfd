import type { UnpaidTransferInvoice } from "../../ports/unpaid-transfer-invoices.reader.js";
import {
  daysLateOf,
  isTransferOverdue,
  transferArrearsOf,
  transferOverdueFrom,
} from "../transfer-arrears.js";
import { NOT_DEPOSITED } from "../public-invoice-due.js";

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
  buyerLegalForm: "sas",
  chorus: NOT_DEPOSITED,
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

describe("les impayés d'un organisme public : le retard part du dépôt sur Chorus (P3, T3′)", () => {
  // Facture publique du 31 octobre, délai figé de 30 jours (échéance au plus tôt le 30 novembre).
  const army = (chorus: UnpaidTransferInvoice["chorus"]): UnpaidTransferInvoice =>
    unpaid({ buyerLegalForm: "public_state", dueOn: "2026-11-30", chorus });

  it("non déposée : jamais en retard, même longtemps après l'échéance imprimée", () => {
    const [arrear] = transferArrearsOf([army(NOT_DEPOSITED)], "2027-03-01");

    expect(arrear).toMatchObject({ effectiveDueOn: null, overdue: false, daysLate: 0 });
  });

  it("déposée le 10 novembre : échéance le 10 décembre, en retard au jour ouvré qui suit", () => {
    const deposited = { ...NOT_DEPOSITED, depositedOn: "2026-11-10" };

    expect(transferArrearsOf([army(deposited)], "2026-12-10")[0]).toMatchObject({
      effectiveDueOn: "2026-12-10",
      overdue: false,
    });
    // Jeudi 10 décembre 2026 → en retard le vendredi 11.
    expect(transferArrearsOf([army(deposited)], "2026-12-11")[0]).toMatchObject({
      overdue: true,
      daysLate: 1,
    });
  });

  it("rejetée par Chorus : listée (un virement s'y affecte encore, T3″) mais jamais en retard", () => {
    const rejected = {
      ...NOT_DEPOSITED,
      depositedOn: "2026-11-10",
      rejectedOn: "2026-11-12",
      rejectionReason: "Service inconnu",
    };

    expect(transferArrearsOf([army(rejected)], "2027-03-01")[0]).toMatchObject({
      effectiveDueOn: null,
      overdue: false,
    });
  });

  it("un pro n'est pas touché : l'échéance effective est celle imprimée", () => {
    expect(transferArrearsOf([unpaid()], "2026-11-16")[0]).toMatchObject({
      effectiveDueOn: "2026-11-14",
      overdue: true,
    });
  });
});
