import type { SubAccountActivity } from "../../sub-account-activity-mail.js";
import type { SubAccountGesture } from "../../sub-account-gesture-mail.js";
import { SPECIMEN_MARK } from "../mail-specimen.types.js";
import {
  greetingTable,
  PRESENCE,
  presence,
  specimenCase,
  specimenOnly,
  variantCase,
  YES_NO,
  yesNo,
} from "./case-builders.js";
import type { MailCaseTables, MailSpecimenCase } from "./mail-specimen-case.types.js";

/** Les cas des e-mails du compte client, de la facturation et du prélèvement. */

const ACTIVITIES: readonly SubAccountActivity[] = [
  "placed",
  "cancelled",
  "abandoned",
  "payment_failed",
];

const ACTIVITY_LABELS: Readonly<Record<SubAccountActivity, string>> = {
  placed: "Commande passée",
  cancelled: "Commande annulée",
  abandoned: "Commande abandonnée",
  payment_failed: "Paiement refusé",
};

/** Chaque geste d'un site, dans l'ordre du dictionnaire : un cas chacun. */
const GESTURE_LABELS: Readonly<Record<SubAccountGesture, string>> = {
  problem_reported: "Problème signalé",
  delivery_address_added: "Adresse de livraison ajoutée",
  delivery_address_updated: "Adresse de livraison modifiée",
  delivery_address_removed: "Adresse de livraison retirée",
  default_delivery_set: "Adresse par défaut changée",
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

const GESTURES = Object.keys(GESTURE_LABELS).filter((gesture): gesture is SubAccountGesture =>
  Object.hasOwn(GESTURE_LABELS, gesture),
);

function activityCase(
  activity: SubAccountActivity,
): MailSpecimenCase<"customer.sub-account-activity"> {
  return variantCase(
    "customer.sub-account-activity",
    activity,
    ACTIVITY_LABELS[activity],
    (data) => ({
      ...data,
      activity,
      enteredByTeam: activity === "cancelled",
    }),
  );
}

function gestureCase(gesture: SubAccountGesture): MailSpecimenCase<"customer.sub-account-gesture"> {
  return variantCase("customer.sub-account-gesture", gesture, GESTURE_LABELS[gesture], (data) => ({
    ...data,
    gesture,
    reference: gesture === "problem_reported" ? data.reference : null,
  }));
}

export const CUSTOMER_CASE_TABLES: Pick<
  MailCaseTables,
  | "customer.collection-notice"
  | "customer.invoice-issued"
  | "customer.mandate-to-sign"
  | "customer.sub-account-activity"
  | "customer.sub-account-gesture"
  | "customer.access-opened"
  | "customer.company-attached"
  | "customer.login-method-linked"
  | "customer.password-reset"
> = {
  "customer.collection-notice": {
    cases: [
      specimenCase("customer.collection-notice", "Premier avis, sur un relevé"),
      variantCase(
        "customer.collection-notice",
        "one-invoice",
        "Premier avis, une facture",
        (data) => ({
          ...data,
          invoiceNumbers: [`${SPECIMEN_MARK}-FA-0001`],
        }),
      ),
      variantCase(
        "customer.collection-notice",
        "correction",
        "Rectificatif, après un rejet",
        (data) => ({
          ...data,
          kind: "correction",
          invoiceNumbers: [`${SPECIMEN_MARK}-FA-0001`, `${SPECIMEN_MARK}-FA-0002`],
          representedRejectionDay: "lundi 5 octobre 2026",
          previous: { amount: "1 000,00 €", collectionDay: "mardi 13 octobre 2026" },
        }),
      ),
      variantCase("customer.collection-notice", "cancellation", "Annulation", (data) => ({
        ...data,
        kind: "cancellation",
        statementReference: "",
      })),
    ],
    axes: [
      { id: "kind", values: ["notice", "correction", "cancellation"], of: (data) => data.kind },
      {
        id: "invoices",
        values: ["none", "one", "several"],
        of: (data) =>
          data.invoiceNumbers.length === 0
            ? "none"
            : data.invoiceNumbers.length === 1
              ? "one"
              : "several",
      },
      { id: "represented", values: PRESENCE, of: (data) => presence(data.representedRejectionDay) },
    ],
  },
  "customer.invoice-issued": {
    cases: [
      specimenCase("customer.invoice-issued", "Avec la facture jointe"),
      variantCase("customer.invoice-issued", "bare", "Sans pièce jointe ni lien", (data) => ({
        ...data,
        period: null,
        paymentMeans: null,
        invoicesUrl: "",
        document: null,
      })),
    ],
    axes: [{ id: "document", values: PRESENCE, of: (data) => presence(data.document?.fileName) }],
  },
  "customer.mandate-to-sign": {
    cases: [
      specimenCase("customer.mandate-to-sign", "Mandat CORE"),
      variantCase("customer.mandate-to-sign", "b2b", "Mandat B2B", (data) => ({
        ...data,
        scheme: "B2B",
      })),
    ],
    axes: [{ id: "scheme", values: ["CORE", "B2B"], of: (data) => data.scheme }],
  },
  "customer.sub-account-activity": {
    cases: [
      specimenCase("customer.sub-account-activity", ACTIVITY_LABELS.placed),
      ...ACTIVITIES.filter((activity) => activity !== "placed").map(activityCase),
    ],
    axes: [
      { id: "activity", values: ACTIVITIES, of: (data) => data.activity },
      { id: "enteredByTeam", values: YES_NO, of: (data) => yesNo(data.enteredByTeam) },
    ],
  },
  "customer.sub-account-gesture": {
    cases: [
      specimenCase("customer.sub-account-gesture", GESTURE_LABELS.problem_reported),
      variantCase(
        "customer.sub-account-gesture",
        "problem-by-team",
        "Problème signalé par l'équipe",
        (data) => ({
          ...data,
          byTeam: true,
        }),
      ),
      ...GESTURES.filter((gesture) => gesture !== "problem_reported").map(gestureCase),
    ],
    axes: [
      { id: "gesture", values: GESTURES, of: (data) => data.gesture },
      { id: "byTeam", values: YES_NO, of: (data) => yesNo(data.byTeam) },
      { id: "reference", values: PRESENCE, of: (data) => presence(data.reference) },
    ],
  },
  "customer.access-opened": {
    cases: [
      specimenCase("customer.access-opened", "Code par e-mail, avec un prénom"),
      variantCase(
        "customer.access-opened",
        "password-only",
        "Mot de passe seul, sans prénom",
        (data) => ({
          ...data,
          firstName: "",
          signInUrl: null,
        }),
      ),
    ],
    axes: [
      { id: "signInUrl", values: PRESENCE, of: (data) => presence(data.signInUrl) },
      { id: "firstName", values: PRESENCE, of: (data) => presence(data.firstName) },
    ],
  },
  "customer.company-attached": greetingTable(
    "customer.company-attached",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "customer.login-method-linked": greetingTable(
    "customer.login-method-linked",
    (data) => data.firstName,
    (data) => ({ ...data, firstName: "" }),
  ),
  "customer.password-reset": specimenOnly("customer.password-reset"),
};
