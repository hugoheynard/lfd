import {
  SPECIMEN_MARK,
  SPECIMEN_PDF_BASE64,
  SPECIMEN_URL,
  type MailSpecimens,
} from "./mail-specimen.types.js";

/** Les exemples des e-mails de l'équipe, du contrôle de mise en service et de la vitrine. */

const PERSON = `${SPECIMEN_MARK} — Jeanne Martin`;
const COMPANY = `${SPECIMEN_MARK} — Hôtel des Trois Ponts`;
const TICKET_URL = `${SPECIMEN_URL}/mot-de-passe`;
const PHONE = "06 00 00 00 00";

export const TEAM_SPECIMENS: Pick<
  MailSpecimens,
  | "staff.appointment-booked"
  | "staff.account-alert"
  | "staff.invited"
  | "ops.deploy-check"
  | "staff.password-reset"
  | "staff.access-suspended"
  | "staff.access-restored"
  | "staff.production-dossier"
  | "staff.production-dossier-updated"
  | "staff.support-requested"
  | "staff.customer-request"
  | "staff.link-payment-received"
  | "staff.pay-link-test"
  | "agency.vitrine-notice"
> = {
  "staff.appointment-booked": {
    family: "team",
    data: () => ({
      contactName: PERSON,
      when: "mardi 13 octobre à 10:00",
      purposeLabel: "Devis",
      channelLabel: "Visio",
      message: "Message d'exemple.",
      appointmentUrl: `${SPECIMEN_URL}/rendez-vous`,
    }),
  },
  "staff.account-alert": {
    family: "team",
    data: () => ({
      companyName: COMPANY,
      ruleLabel: "Chute de volume",
      orderNumber: `${SPECIMEN_MARK}-0001`,
      findings: ["Baguette tradition : −40 %", "Croissant : −20 %"],
      accountUrl: `${SPECIMEN_URL}/compte`,
    }),
  },
  "staff.invited": {
    family: "team",
    data: () => ({ firstName: SPECIMEN_MARK, passwordSetupUrl: TICKET_URL }),
  },
  "ops.deploy-check": {
    family: "team",
    data: () => ({ revision: SPECIMEN_MARK, fromAddress: "exemple@exemple.invalid" }),
  },
  "staff.password-reset": {
    family: "team",
    data: () => ({ firstName: SPECIMEN_MARK, passwordSetupUrl: TICKET_URL }),
  },
  "staff.access-suspended": {
    family: "team",
    data: () => ({ firstName: SPECIMEN_MARK }),
  },
  "staff.access-restored": {
    family: "team",
    data: () => ({ firstName: SPECIMEN_MARK, backOfficeUrl: SPECIMEN_URL }),
  },
  "staff.production-dossier": {
    family: "team",
    data: () => ({
      firstName: SPECIMEN_MARK,
      dayLabel: "mercredi 7 octobre 2026",
      arrestedAtLabel: "mardi 6 octobre 2026 à 20:00",
      arrestedBy: `par ${PERSON}`,
      orderCount: 3,
      pickupCount: 2,
      deliveryCount: 1,
      resupplyCount: 0,
      resupplyPieceCount: 0,
      pieceCount: 40,
      completed: false,
      pdfBase64: SPECIMEN_PDF_BASE64,
      fileName: `dossier-du-jour-${SPECIMEN_MARK}.pdf`,
    }),
  },
  "staff.production-dossier-updated": {
    family: "team",
    data: () => ({
      firstName: SPECIMEN_MARK,
      dayLabel: "mercredi 7 octobre 2026",
      version: 3,
      sinceVersion: 1,
      received: true,
      production: [
        { productName: "Croissant", before: "120", after: "135", delta: "+15" },
        { productName: "Pain de campagne", before: "2 kg", after: "1,5 kg", delta: "−500 g" },
      ],
      changes: [
        {
          kind: "entered",
          shipment: { reference: `${SPECIMEN_MARK}-0031`, rank: 1 },
          reason: "retaken_off_plan",
          atLabel: "19 h 10",
        },
        {
          kind: "revised",
          shipment: { reference: `${SPECIMEN_MARK}-0012`, rank: 2 },
          lines: [{ productName: "Croissant", before: "10", after: "15" }],
        },
        { kind: "withdrawn", shipment: { reference: `${SPECIMEN_MARK}-0007`, rank: 1 } },
      ],
      otherChanges: 2,
      resupplies: [{ kind: "launched", siteLabel: "Le Village", name: null }],
      toCheck: [{ reference: `${SPECIMEN_MARK}-0044`, rank: 1 }],
      pdfBase64: SPECIMEN_PDF_BASE64,
      fileName: `dossier-du-jour-${SPECIMEN_MARK}-version-3.pdf`,
    }),
  },
  "staff.support-requested": {
    family: "team",
    data: () => ({
      contactName: PERSON,
      purposeLabel: "Facturation",
      availability: "Mardi matin",
      phoneNumber: PHONE,
      message: "Message d'exemple.",
    }),
  },
  "staff.customer-request": {
    family: "team",
    data: () => ({
      requestId: "specimen-request",
      formLabel: "Signaler un problème",
      reasonLabel: "Produit abîmé",
      urgent: true,
      authorName: PERSON,
      authorEmail: "exemple@exemple.invalid",
      authorPhone: PHONE,
      originLabel: "Espace pro",
      clientLabel: COMPANY,
      orderNumber: `${SPECIMEN_MARK}-0001`,
      photoCount: 2,
      message: "Message d'exemple.",
    }),
  },
  "staff.link-payment-received": {
    family: "team",
    data: () => ({
      amountCents: 12_345,
      channelLabel: "lfc-stripe (Stripe)",
      payerLabel: COMPANY,
      applicationLabel: "La Folie Coffee",
      settledLabel: `Paiement libre — ${SPECIMEN_MARK}`,
      screenPath: "/comptabilite/liens-de-paiement",
      linkCreatedOn: "mardi 13 octobre à 10:00",
      linkCreatedAutomatically: false,
      linkAuthorName: PERSON,
      refused: false,
    }),
  },
  "staff.pay-link-test": {
    family: "team",
    data: () => ({ payUrl: `${SPECIMEN_URL}/payer/${SPECIMEN_MARK}` }),
  },
  "agency.vitrine-notice": {
    family: "team",
    data: () => ({
      subject: `${SPECIMEN_MARK} — Nouveautés de la semaine`,
      message: "Message d'exemple, écrit au back-office.",
    }),
  },
};
