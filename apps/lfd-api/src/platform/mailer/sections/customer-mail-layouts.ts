import {
  KICKER,
  NAMED_TITLE,
  SUBJECT,
  texts,
  variants,
  variantsOf,
  type MailLayouts,
} from "./mail-layout.types.js";

/** Ce qu'un site a fait d'une commande (`customer.sub-account-activity`). */
const ACTIVITIES = {
  placed: "Commande passée",
  cancelled: "Commande annulée",
  abandoned: "Commande abandonnée",
  payment_failed: "Paiement refusé",
};

/** Ce qu'un site a fait hors commande (`customer.sub-account-gesture`). */
const GESTURES = {
  problem_reported: "Problème signalé",
  delivery_address_added: "Adresse de livraison ajoutée",
  delivery_address_updated: "Adresse de livraison modifiée",
  delivery_address_removed: "Adresse de livraison retirée",
  default_delivery_set: "Adresse par défaut choisie",
  contact_added: "Contact ajouté",
  contact_updated: "Contact modifié",
  contact_removed: "Contact retiré",
  primary_contact_changed: "Contact principal changé",
  bank_account_changed: "Compte bancaire changé",
  mandate_proof_attached: "Preuve de mandat jointe",
  subscription_created: "Abonnement créé",
  subscription_paused: "Abonnement en pause",
  subscription_resumed: "Abonnement repris",
  subscription_stopped: "Abonnement arrêté",
};

/** Les deux schémas SEPA d'un mandat. */
const SCHEMES = { CORE: "Mandat CORE (particulier)", B2B: "Mandat B2B (entreprise)" };

/** Les e-mails de facturation, de prélèvement et de compte, adressés au client. */
export const CUSTOMER_MAIL_LAYOUTS: Readonly<
  Pick<
    MailLayouts,
    | "customer.collection-notice"
    | "customer.invoice-issued"
    | "customer.mandate-to-sign"
    | "customer.access-opened"
    | "customer.company-attached"
    | "customer.login-method-linked"
    | "customer.password-reset"
    | "customer.sub-account-activity"
    | "customer.sub-account-gesture"
  >
> = {
  "customer.collection-notice": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      {
        id: "title",
        texts: variantsOf("title", {
          notice: "Premier avis",
          correction: "Rectificatif",
          cancellation: "Annulation",
        }),
      },
      {
        id: "body",
        texts: [
          ...texts("greeting"),
          ...variants({
            cancelled: "Annulation",
            correctionLead: "Rectificatif",
            representationLead: "Nouvelle présentation après un rejet",
            announced: "Premier avis ou rectificatif",
            piecesStatement: "Réglé par un relevé",
            piecesOneInvoice: "Une facture",
            piecesInvoices: "Plusieurs factures",
          }),
        ],
      },
      {
        id: "summary",
        texts: texts(
          "creditorLabel",
          "creditorIdentifierLabel",
          "mandateReferenceLabel",
          "cancelledAmountLabel",
          "announcedDayLabel",
          "previousLabel",
          "previousValue",
          "collectionDayLabel",
          "representationLabel",
          "statementLabel",
          "invoiceLabel",
          "invoicesLabel",
          "amountLabel",
        ),
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.invoice-issued": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: [
          ...texts("greeting", "intro"),
          ...variants({ periodClause: "Facture d'une période", attachedNote: "PDF joint" }),
        ],
      },
      {
        id: "summary",
        texts: texts(
          "invoiceLabel",
          "dateLabel",
          "periodLabel",
          "addressedToLabel",
          "dueLabel",
          "paymentLabel",
          "totalLabel",
        ),
      },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.mandate-to-sign": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      {
        id: "title",
        texts: [
          ...texts("title"),
          { path: "scheme.CORE.documentName", variant: SCHEMES.CORE },
          { path: "scheme.B2B.documentName", variant: SCHEMES.B2B },
        ],
      },
      { id: "body", texts: texts("greeting", "intro") },
      {
        id: "summary",
        texts: texts("mandateReferenceLabel", "creditorIdentifierLabel", "creditorLabel"),
      },
      {
        id: "footer",
        texts: [
          { path: "scheme.CORE.footer", variant: SCHEMES.CORE },
          { path: "scheme.B2B.footer", variant: SCHEMES.B2B },
        ],
      },
    ],
  },
  "customer.access-opened": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      {
        id: "body",
        texts: [
          ...texts("opened"),
          ...variants({
            choosePassword: "Sans lien de connexion",
            signInWithCode: "Avec lien de connexion",
          }),
        ],
      },
      {
        id: "cta",
        texts: variants({
          choosePasswordCta: "Sans lien de connexion",
          signInCta: "Avec lien de connexion",
        }),
      },
      { id: "secondaryLink", label: "Choisir un mot de passe", texts: texts("passwordLink") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.company-attached": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("attached", "nothingToCreate") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.login-method-linked": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: NAMED_TITLE },
      { id: "body", texts: texts("linked", "sameAccount") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.password-reset": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: [
          ...texts("requested", "linkRules"),
          ...variants({
            validityOneHour: "Lien valable une heure",
            validityHours: "Plusieurs heures",
          }),
        ],
      },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.sub-account-activity": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: variantsOf("title", ACTIVITIES) },
      {
        id: "body",
        texts: [
          ...variants({ body: "Geste du site", bodyEnteredByTeam: "Saisie par notre équipe" }),
          ...variantsOf("action", ACTIVITIES),
        ],
      },
      { id: "summary", texts: texts("siteLabel", "orderLabel", "dayLabel", "totalLabel") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.sub-account-gesture": {
    subject: variants({ subject: "Sans référence", subjectWithReference: "Avec une référence" }),
    header: KICKER,
    sections: [
      { id: "title", texts: variantsOf("title", GESTURES) },
      {
        id: "body",
        texts: [
          ...variants({
            body: "Geste du site",
            bodyWithReference: "Geste du site, avec une référence",
            bodyByTeam: "Fait par notre équipe",
            bodyWithReferenceByTeam: "Fait par notre équipe, avec une référence",
          }),
          ...variantsOf("action", GESTURES),
        ],
      },
      {
        id: "summary",
        texts: [
          ...texts("siteLabel", "referenceLabel"),
          { path: "referenceLabelOf.problem_reported", variant: GESTURES.problem_reported },
        ],
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
};
