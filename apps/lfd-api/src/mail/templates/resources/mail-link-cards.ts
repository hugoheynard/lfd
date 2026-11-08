import type { MailResourceCard } from "@lfd/mail-blocks";

import type { B2bMails } from "../mail-templates.js";

/**
 * Les liens qu'un e-mail fournit. Le bouton du modèle n'a ici que son nom
 * court : sa description EST `ctaDestination` (`sections/*-mail-layouts.ts`),
 * une seule source. Le lien secondaire porte sa fiche entière.
 */
export interface MailLinkCards {
  readonly cta?: { readonly label: string };
  readonly secondaryLink?: MailResourceCard;
}

/** La liste des commandes : là où mènent les quatre boutons « Voir ma commande ». */
const ORDER_LIST = { label: "Liste de ses commandes" };

/**
 * **Les liens de chaque e-mail** (plan `plan-editeur-par-blocs.md`, § 24, R1),
 * lus dans les gabarits le 2026-11-07. Exhaustive : un e-mail ajouté au
 * registre ne compile pas sans son entrée ; le test tient l'accord avec ses
 * sections (`cta`, `secondaryLink`).
 */
export const MAIL_LINK_CARDS: { readonly [K in keyof B2bMails]: MailLinkCards } = {
  "customer.order-placed": { cta: ORDER_LIST },
  "customer.order-ready": { cta: ORDER_LIST },
  "customer.delivery-en-route": { cta: ORDER_LIST },
  "customer.order-delayed": { cta: ORDER_LIST },
  "customer.order-placed-with-your-email": {},
  "customer.payment-failed": { cta: { label: "Reprendre le règlement" } },
  "customer.payment-expired": {},
  "customer.order-cancelled": {},
  "customer.order-payment-link": { cta: { label: "Lien de règlement" } },
  "customer.invoice-issued": { cta: { label: "Ses factures" } },
  "customer.collection-notice": {},
  "customer.mandate-to-sign": {},
  "customer.access-opened": {
    cta: { label: "Connexion à la boutique" },
    secondaryLink: {
      label: "Choisir un mot de passe",
      description:
        "Son lien à usage unique pour choisir un mot de passe, quand le bouton mène à la connexion par code.",
    },
  },
  "customer.company-attached": {},
  "customer.login-method-linked": {},
  "customer.password-reset": { cta: { label: "Nouveau mot de passe" } },
  "customer.marketing-confirm": { cta: { label: "Confirmer l'inscription" } },
  "customer.sub-account-activity": {},
  "customer.sub-account-gesture": {},
  "customer.order-change-applied": {},
  "customer.order-change-refused": {},
  "customer.order-shortfall": {},
  "staff.appointment-booked": { cta: { label: "Le rendez-vous" } },
  "staff.account-alert": { cta: { label: "Alertes du compte" } },
  "staff.invited": { cta: { label: "Choisir son mot de passe" } },
  "ops.deploy-check": {},
  "staff.password-reset": { cta: { label: "Nouveau mot de passe" } },
  "staff.access-suspended": {},
  "staff.access-restored": { cta: { label: "Accueil du back-office" } },
  "staff.production-dossier": {},
  "staff.support-requested": {},
  "staff.customer-request": { cta: { label: "La demande du client" } },
  "agency.vitrine-notice": {},
};
