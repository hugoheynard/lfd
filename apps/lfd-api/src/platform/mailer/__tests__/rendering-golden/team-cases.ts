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
  | "staff.support-requested"
  | "staff.customer-request"
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
  "agency.vitrine-notice": {
    only: { subject: "Nouveautés\nde la semaine", message: "Bonjour <b>l'agence</b>" },
  },
};
