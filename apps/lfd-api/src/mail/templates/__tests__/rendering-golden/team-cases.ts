import type { B2bMails } from "../../mail-templates.js";
import type { MailCases } from "./mail-cases.type.js";

/** Les cas des e-mails de l'équipe, du contrôle de mise en service et de la vitrine. */

const DOSSIER: B2bMails["staff.production-dossier"] = {
  firstName: "Paul",
  dayLabel: "mercredi 7 octobre 2026",
  arrestedAtLabel: "mardi 6 octobre 2026 à 20:00",
  arrestedBy: "par Marie Dupont",
  orderCount: 3,
  pickupCount: 2,
  deliveryCount: 1,
  resupplyCount: 0,
  resupplyPieceCount: 0,
  pieceCount: 40,
  completed: false,
  pdfBase64: "JVBERi0=",
  fileName: "dossier-du-jour-2026-10-07.pdf",
};

const DOSSIER_UPDATED: B2bMails["staff.production-dossier-updated"] = {
  firstName: "Paul",
  dayLabel: "mercredi 7 octobre 2026",
  version: 3,
  sinceVersion: 1,
  received: true,
  production: [{ productName: "Croissant", before: "120", after: "135", delta: "+15" }],
  changes: [
    {
      kind: "entered",
      shipment: { reference: "ORD-0031", rank: 1 },
      reason: "retaken_off_plan",
      atLabel: "19 h 10",
    },
    {
      kind: "revised",
      shipment: { reference: "ORD-0012", rank: 2 },
      lines: [{ productName: "Croissant", before: "10", after: "15" }],
    },
    { kind: "withdrawn", shipment: { reference: null, rank: 1 } },
  ],
  otherChanges: 1,
  resupplies: [{ kind: "entered", siteLabel: null, name: "Matin" }],
  toCheck: [{ reference: "ORD-0044", rank: 1 }],
  pdfBase64: "JVBERi0=",
  fileName: "dossier-du-jour-2026-10-07-v16-version-3.pdf",
};

const REQUEST: B2bMails["staff.customer-request"] = {
  requestId: "req 1",
  formLabel: "Signaler un problème",
  reasonLabel: "Produit abîmé",
  urgent: true,
  authorName: "Jeanne Martin",
  authorEmail: "jeanne@example.test",
  authorPhone: "06 00 00 00 00",
  originLabel: "Espace pro",
  clientLabel: "Hôtel des Trois Ponts",
  orderNumber: "ORD-4812",
  photoCount: 2,
  message: "  Le pain était écrasé.  ",
};

const LINK_PAYMENT: B2bMails["staff.link-payment-received"] = {
  amountCents: 12_345,
  channelLabel: "lfc-stripe (Stripe)",
  payerLabel: "Hôtel des Trois Ponts",
  applicationLabel: "La Folie Coffee",
  settledLabel: "Paiement libre — Acompte du traiteur",
  screenPath: "/comptabilite/liens-de-paiement",
  linkCreatedOn: "mardi 13 octobre 2026 à 10:00",
  linkCreatedAutomatically: false,
  linkAuthorName: "Jeanne Martin",
  refused: false,
};

export const TEAM_CASES: Pick<
  MailCases,
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
    only: {
      contactName: "Jeanne Martin",
      when: "mardi 13 octobre à 10:00",
      purposeLabel: "Devis",
      channelLabel: "Visio",
      message: "Bonjour",
      appointmentUrl: "https://bo.lfc.test/rdv/1",
    },
    noMessage: {
      contactName: "Jeanne Martin",
      when: "mardi 13 octobre à 10:00",
      purposeLabel: "Devis",
      channelLabel: "",
      message: "  ",
      appointmentUrl: "https://bo.lfc.test/rdv/1",
    },
  },
  "staff.account-alert": {
    only: {
      companyName: "Hôtel des Trois Ponts",
      ruleLabel: "Chute de volume",
      orderNumber: "ORD-4812",
      findings: ["Tradition : −40 %", "Croissant : −20 %"],
      accountUrl: "https://bo.lfc.test/comptes/1",
    },
  },
  "staff.invited": {
    named: { firstName: "Paul", passwordSetupUrl: "https://auth.test/ticket" },
    anonymous: { firstName: "", passwordSetupUrl: "https://auth.test/ticket" },
  },
  "ops.deploy-check": { only: { revision: "abc1234", fromAddress: "noreply@lfc.test" } },
  "staff.password-reset": {
    named: { firstName: "Paul", passwordSetupUrl: "https://auth.test/ticket" },
    anonymous: { firstName: "", passwordSetupUrl: "https://auth.test/ticket" },
  },
  "staff.access-suspended": { named: { firstName: "Paul" }, anonymous: { firstName: "" } },
  "staff.access-restored": {
    named: { firstName: "Paul", backOfficeUrl: "https://bo.lfc.test" },
    anonymous: { firstName: "", backOfficeUrl: "https://bo.lfc.test" },
  },
  "staff.production-dossier": {
    arrested: DOSSIER,
    completedAnonymous: { ...DOSSIER, firstName: "", arrestedBy: "", completed: true },
    resupplies: {
      ...DOSSIER,
      orderCount: 1,
      pickupCount: 0,
      deliveryCount: 0,
      resupplyCount: 2,
      resupplyPieceCount: 18,
      pieceCount: 58,
    },
    resuppliesSplit: { ...DOSSIER, resupplyCount: 1, resupplyPieceCount: 1, pieceCount: 1 },
    noSplit: { ...DOSSIER, orderCount: 0, pickupCount: 0, deliveryCount: 0, pieceCount: 0 },
    deliveryOnly: { ...DOSSIER, pickupCount: 0, completed: true, arrestedBy: "automatiquement" },
  },
  "staff.production-dossier-updated": {
    outdated: DOSSIER_UPDATED,
    everyKind: {
      ...DOSSIER_UPDATED,
      changes: [
        ...(["arrested", "retaken", "rearrested", "rearrested_off_plan", "unknown"] as const).map(
          (reason, index) => ({
            kind: "entered" as const,
            shipment: { reference: `ORD-010${String(index)}`, rank: 1 },
            reason,
            atLabel: "21 h 05",
          }),
        ),
        ...(["modified_during_reopen", "lines_changed"] as const).map((kind) => ({
          kind,
          shipment: { reference: "ORD-0200", rank: 1 },
          lines: [
            { productName: "Pain de campagne", before: "2 kg", after: "1,5 kg" },
            { productName: "Croissant", before: "4", after: "6" },
          ],
        })),
        { kind: "left_after_withdrawal", shipment: { reference: "ORD-0300", rank: 3 } },
      ],
      otherChanges: 4,
      resupplies: [
        { kind: "launched", siteLabel: "Le Village", name: null },
        { kind: "left", siteLabel: "Le Labo", name: "Soir" },
      ],
    },
    nothingReceived: {
      ...DOSSIER_UPDATED,
      firstName: "",
      received: false,
      production: [],
      changes: [],
      otherChanges: 0,
      resupplies: [],
      toCheck: [],
    },
  },
  "staff.support-requested": {
    only: {
      contactName: "Jeanne Martin",
      purposeLabel: "Facturation",
      availability: "Mardi matin",
      phoneNumber: "06 00 00 00 00",
      message: "Rappelez-moi",
    },
  },
  "staff.customer-request": {
    urgent: REQUEST,
    plain: {
      ...REQUEST,
      urgent: false,
      orderNumber: "",
      photoCount: 0,
      authorPhone: "",
      clientLabel: "",
      message: "",
    },
  },
  "staff.link-payment-received": {
    paid: LINK_PAYMENT,
    refused: { ...LINK_PAYMENT, refused: true, linkCreatedAutomatically: true, linkAuthorName: "" },
    noScreen: { ...LINK_PAYMENT, screenPath: "" },
    unknownAuthor: { ...LINK_PAYMENT, linkAuthorName: "" },
  },
  "staff.pay-link-test": {
    only: { payUrl: "https://app.lfc.test/payer/jeton-d-essai" },
  },
  "agency.vitrine-notice": {
    only: { subject: "Nouveautés\nde la semaine", message: "Bonjour <b>l'agence</b>" },
  },
};
