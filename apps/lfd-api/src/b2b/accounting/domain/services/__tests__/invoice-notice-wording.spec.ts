import { Invoice } from "../../entities/invoice.js";
import {
  breakdownOf,
  issueInput,
  issuedInvoice,
  line,
} from "../../entities/__tests__/invoice-fixtures.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { paris } from "./billing-mode-fixtures.js";
import { invoiceNoticeContent } from "../invoice-notice-wording.js";

/** Septembre 2026, du 1er au 30 inclus — comparé à aucune horloge. */
const SEPTEMBER = { startsAt: paris("2026-09-01"), closesAt: paris("2026-10-01") };

describe("le contenu de « Votre facture » (E6)", () => {
  it("numéro, dates en toutes lettres, période, TTC, échéance et lien", () => {
    const invoice = Invoice.issue(
      issueInput({ paymentMeans: { code: "59", mandateReference: "RUM-PORT-1" } }),
    );

    expect(
      invoiceNoticeContent(invoice.toState(), SEPTEMBER, "https://boutique.test/mon-compte"),
    ).toEqual({
      invoiceNumber: "FA-LFD-2026-000001",
      sellerName: invoice.toState().seller.name,
      buyerName: "Boulangerie du Port",
      issuedOn: "mercredi 30 septembre 2026",
      period: "du 1er au 30 septembre 2026",
      total: "16,55\u00A0€",
      dueOn: "mercredi 14 octobre 2026",
      paymentMeans: "Prélèvement SEPA — mandat RUM-PORT-1",
      invoicesUrl: "https://boutique.test/mon-compte",
    });
  });

  it("sans moyen figé, n'en écrit aucun ; hors facture du mois, pas de période", () => {
    const content = invoiceNoticeContent(issuedInvoice().toState(), null, "");

    expect(content?.paymentMeans).toBeNull();
    expect(content?.period).toBeNull();
  });

  it("un avoir ne prévient personne", () => {
    const lines = [line("PAIN", 5.5, 500)];
    const creditNote = Invoice.creditNote({
      id: "cn_1",
      number: InvoiceNumber.compose("LFD", 2026, 2),
      issuedOn: "2026-10-01",
      corrected: issuedInvoice(),
      priorCreditNotes: [],
      orders: [],
      lines,
      vat: breakdownOf(lines),
    });

    expect(invoiceNoticeContent(creditNote.toState(), null, "")).toBeNull();
  });

  it("dit la période DU PAYEUR, pas le mois où elle s'achève (M4a)", () => {
    const week = { startsAt: paris("2026-10-05"), closesAt: paris("2026-10-12") };
    expect(invoiceNoticeContent(issuedInvoice().toState(), week, "")?.period).toBe(
      "du 5 au 11 octobre 2026",
    );
  });
});
