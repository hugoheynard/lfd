import { Invoice } from "../../entities/invoice.js";
import { SEPA_CREDIT_TRANSFER } from "../../entities/invoice.types.js";
import { BUYER, issueInput } from "../../entities/__tests__/invoice-fixtures.js";
import { renderFacturXml } from "../facturx-xml.js";
import { invoiceNoticeContent } from "../invoice-notice-wording.js";
import {
  awaitsPayment,
  effectiveDueOn,
  isPublicInvoice,
  NOT_DEPOSITED,
  publicDeadlineDaysOf,
  publicInvoiceDueOn,
  type DueInvoiceFacts,
} from "../public-invoice-due.js";

// Jours comparés entre eux seulement : aucune horloge.
const ARMY: DueInvoiceFacts = {
  isCreditNote: false,
  buyerLegalForm: "public_state",
  issuedOn: "2026-09-30",
  dueOn: "2026-10-30",
};
const HOSPITAL: DueInvoiceFacts = {
  ...ARMY,
  buyerLegalForm: "public_health_establishment",
  dueOn: "2026-11-19",
};
const BAKERY: DueInvoiceFacts = { ...ARMY, buyerLegalForm: "SARL", dueOn: "2026-10-14" };

describe("l'échéance d'une facture d'organisme public (P3, T1′, T3′)", () => {
  it("à l'émission : date de facture + délai légal, en jours calendaires (30, 50 pour la santé)", () => {
    expect(publicInvoiceDueOn("2026-09-30", "public_state")).toBe("2026-10-30");
    expect(publicInvoiceDueOn("2026-09-30", "public_health_establishment")).toBe("2026-11-19");
    expect(publicInvoiceDueOn("2026-09-30", "SARL")).toBeNull();
    expect(publicInvoiceDueOn("2026-09-30", "")).toBeNull();
  });

  it("le délai est figé par la pièce (due_on − issued_on), jamais relu de la forme du jour", () => {
    expect(publicDeadlineDaysOf(ARMY)).toBe(30);
    expect(publicDeadlineDaysOf(HOSPITAL)).toBe(50);
    expect(publicDeadlineDaysOf(BAKERY)).toBeNull();
    expect(publicDeadlineDaysOf({ ...ARMY, isCreditNote: true, dueOn: null })).toBeNull();
  });

  it("non déposée : aucune échéance effective", () => {
    expect(effectiveDueOn(ARMY, null)).toBeNull();
    expect(effectiveDueOn(ARMY, NOT_DEPOSITED)).toBeNull();
  });

  it("déposée : jour du dépôt + délai figé ; la mise en paiement n'y change rien", () => {
    const deposited = { ...NOT_DEPOSITED, depositedOn: "2026-10-05" };
    expect(effectiveDueOn(ARMY, deposited)).toBe("2026-11-04");
    expect(effectiveDueOn(HOSPITAL, deposited)).toBe("2026-11-24");
    expect(effectiveDueOn(ARMY, { ...deposited, acceptedOn: "2026-10-20" })).toBe("2026-11-04");
  });

  it("rejetée : aucune échéance, et hors des paiements attendus", () => {
    const rejected = {
      ...NOT_DEPOSITED,
      depositedOn: "2026-10-05",
      rejectedOn: "2026-10-07",
      rejectionReason: "Engagement inconnu",
    };
    expect(effectiveDueOn(ARMY, rejected)).toBeNull();
    expect(awaitsPayment(ARMY, rejected)).toBe(false);
    expect(awaitsPayment(ARMY, NOT_DEPOSITED)).toBe(true);
  });

  it("un pro, ou un avoir, n'est pas touché : l'échéance est celle imprimée", () => {
    expect(effectiveDueOn(BAKERY, null)).toBe("2026-10-14");
    expect(isPublicInvoice(BAKERY)).toBe(false);
    expect(isPublicInvoice({ ...ARMY, isCreditNote: true })).toBe(false);
  });
});

describe("ce qu'imprime une facture d'organisme public (T1″)", () => {
  const publicInvoice = Invoice.issue(
    issueInput({
      buyer: { ...BUYER, legalForm: "public_state", name: "Base de défense" },
      dueOn: "2026-10-30",
      paymentMeans: { code: SEPA_CREDIT_TRANSFER },
    }),
  );

  it("Factur-X : BT-20 dit la condition de Chorus, BT-9 est omis", () => {
    const xml = renderFacturXml(publicInvoice);

    expect(xml).toContain(
      "Paiement à 30 jours à compter de la réception de la facture sur Chorus Pro.",
    );
    expect(xml).not.toContain("DueDateDateTime");
    expect(xml).not.toContain("Avoir : sans échéance.");
  });

  it("un pro garde son échéance en BT-9 et en BT-20", () => {
    const xml = renderFacturXml(Invoice.issue(issueInput({})));

    expect(xml).toContain("DueDateDateTime");
    expect(xml).toContain("Échéance : 14/10/2026.");
  });

  it("l'avis par e-mail porte le délai, pour dire la condition au lieu d'une date", () => {
    const content = invoiceNoticeContent(publicInvoice.toState(), null, "");

    expect(content).toMatchObject({ publicPaymentDeadlineDays: 30 });
    expect(invoiceNoticeContent(Invoice.issue(issueInput({})).toState(), null, "")).toMatchObject({
      publicPaymentDeadlineDays: null,
    });
  });
});
