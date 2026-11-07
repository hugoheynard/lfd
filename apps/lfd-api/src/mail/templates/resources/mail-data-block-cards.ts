import type { MailDataBlockId, MailResourceCard } from "@lfd/mail-blocks";

import type { B2bMails } from "../mail-templates.js";

/** Les blocs de données d'un e-mail, et ce que chacun montre dans CET e-mail. */
export type MailDataBlockCards = { readonly [B in MailDataBlockId]?: MailResourceCard };

/** Le QR de retrait, le même dans les deux e-mails qui le portent. */
const PICKUP_QR: MailResourceCard = {
  label: "Code de retrait (QR)",
  description:
    "Le QR que l'équipe scanne au comptoir, avec sa légende ; absent pour une livraison ou sans lien de retrait.",
};

/** L'itinéraire vers le point de retrait. */
const ITINERARY: MailResourceCard = {
  label: "Itinéraire vers la boutique",
  description: "Le lien d'itinéraire vers le point de retrait ; absent pour une livraison.",
};

/** Un récapitulatif d'une seule ligne. */
const ONE_LINE_SUMMARY = (label: string): MailResourceCard => ({
  label: "Récapitulatif",
  description: `Une ligne : ${label}.`,
});

/**
 * **Les blocs de données de chaque e-mail** (plan `plan-editeur-par-blocs.md`,
 * § 24, R1) : ce que le récapitulatif, le QR et l'itinéraire montrent, lu
 * dans les libellés de leurs sections le 2026-11-07. Ils se placent, ils ne
 * s'écrivent pas. Le test tient l'accord avec les blocs déclarés.
 */
export const MAIL_DATA_BLOCK_CARDS: { readonly [K in keyof B2bMails]: MailDataBlockCards } = {
  "customer.order-placed": {
    summary: {
      label: "Récapitulatif de la commande",
      description:
        "Le jour, le retrait ou la livraison avec son créneau, le contenu, les remises, le bon de fidélité, la TVA et le total selon le règlement.",
    },
    image: PICKUP_QR,
    itinerary: ITINERARY,
  },
  "customer.order-ready": {
    summary: {
      label: "Récapitulatif de la commande",
      description: "Où retirer la commande et son contenu.",
    },
    image: PICKUP_QR,
    itinerary: ITINERARY,
  },
  "customer.delivery-en-route": {
    summary: {
      label: "Récapitulatif de la livraison",
      description: "La commande, l'adresse livrée et le créneau.",
    },
  },
  "customer.order-delayed": {
    summary: { label: "Récapitulatif", description: "La commande et où la retirer." },
  },
  "customer.order-placed-with-your-email": {},
  "customer.payment-failed": { summary: ONE_LINE_SUMMARY("le montant à régler") },
  "customer.payment-expired": { summary: ONE_LINE_SUMMARY("le montant non débité") },
  "customer.order-cancelled": {},
  "customer.order-payment-link": { summary: ONE_LINE_SUMMARY("le montant à régler") },
  "customer.invoice-issued": {
    summary: {
      label: "Récapitulatif de la facture",
      description:
        "Le numéro, la date, la période, le destinataire, l'échéance, le règlement et le total TTC.",
    },
  },
  "customer.collection-notice": {
    summary: {
      label: "Récapitulatif du prélèvement",
      description:
        "Le montant, la date, ce qui est réglé (arrêté ou factures), le créancier, son identifiant (ICS) et la référence du mandat (RUM).",
    },
  },
  "customer.mandate-to-sign": {
    summary: {
      label: "Références du mandat",
      description: "La référence du mandat (RUM), l'identifiant créancier (ICS) et le créancier.",
    },
  },
  "customer.access-opened": {},
  "customer.company-attached": {},
  "customer.login-method-linked": {},
  "customer.password-reset": {},
  "customer.sub-account-activity": {
    summary: {
      label: "Récapitulatif de la commande du site",
      description: "Le site, la commande, son jour et son montant TTC.",
    },
  },
  "customer.sub-account-gesture": {
    summary: {
      label: "Récapitulatif du geste",
      description: "Le site, et la référence de ce sur quoi porte le geste quand il en a une.",
    },
  },
  "customer.order-change-applied": { summary: ONE_LINE_SUMMARY("le nouveau total TTC") },
  "customer.order-change-refused": { summary: ONE_LINE_SUMMARY("le mot de notre équipe") },
  "customer.order-shortfall": {},
  "staff.appointment-booked": {},
  "staff.account-alert": {},
  "staff.invited": {},
  "ops.deploy-check": {},
  "staff.password-reset": {},
  "staff.access-suspended": {},
  "staff.access-restored": {},
  "staff.production-dossier": {},
  "staff.support-requested": {},
  "staff.customer-request": {},
  "agency.vitrine-notice": {},
};
