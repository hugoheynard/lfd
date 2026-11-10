import type { ClientSheet, SettlementRegime } from "@lfd/contracts";

import {
  PRESENCE,
  presence,
  specimenCase,
  specimenOnly,
  variantCase,
  YES_NO,
  yesNo,
} from "./case-builders.js";
import type { MailCaseAxis, MailCaseTables } from "./mail-specimen-case.types.js";

/** Les cas des e-mails d'une commande : confirmation, retrait, livraison, retard. */

const SETTLEMENTS: readonly SettlementRegime[] = ["paid", "due", "account", "free"];

/** Livrée plutôt que retirée : plus de site de retrait. */
export function delivered(sheet: ClientSheet): ClientSheet {
  return {
    ...sheet,
    fulfillment: { ...sheet.fulfillment, method: "delivery", pickupLabel: null },
  };
}

const settlementAxis = {
  id: "settlement",
  values: SETTLEMENTS,
  of: (data: { readonly sheet: ClientSheet }) => data.sheet.money.settlement,
} as const;

const methodAxis = {
  id: "method",
  values: ["pickup", "delivery"],
  of: (data: { readonly sheet: ClientSheet }) => data.sheet.fulfillment.method,
} as const;

const readyMomentAxis: MailCaseAxis<"customer.order-ready"> = {
  id: "moment",
  values: ["announced", "reminder", "remainder"],
  of: (data) =>
    data.reminder === true ? "reminder" : data.remainder === undefined ? "announced" : "remainder",
};

export const ORDER_CASE_TABLES: Pick<
  MailCaseTables,
  | "customer.order-placed"
  | "customer.order-ready"
  | "customer.delivery-en-route"
  | "customer.order-delayed"
  | "customer.order-placed-with-your-email"
  | "customer.payment-failed"
  | "customer.payment-expired"
  | "customer.order-modification-failed"
  | "customer.order-payment-link"
> = {
  "customer.order-placed": {
    cases: [specimenCase("customer.order-placed", "Retrait, payée en ligne")],
    axes: [],
    // § 23 : un seul e-mail pour toutes les commandes ; règlement, trajet et
    // clientèle ne changent que le récapitulatif et le QR, blocs système.
    axesInSystemBlocks: [
      settlementAxis,
      methodAxis,
      { id: "variant", values: ["pro", "public"], of: (data) => data.sheet.variant },
    ],
  },
  "customer.order-ready": {
    cases: [
      specimenCase("customer.order-ready", "Prête au retrait"),
      variantCase("customer.order-ready", "delivery", "Prête à livrer", (data) => ({
        ...data,
        sheet: delivered(data.sheet),
        handoverToken: null,
        handoverUrl: "",
      })),
      variantCase("customer.order-ready", "reminder", "Rappel : pas encore venu", (data) => ({
        ...data,
        reminder: true,
      })),
      variantCase("customer.order-ready", "remainder", "Le reste de la commande", (data) => ({
        ...data,
        remainder: { pieces: 3 },
      })),
    ],
    axes: [methodAxis, readyMomentAxis],
  },
  "customer.delivery-en-route": {
    cases: [
      specimenCase("customer.delivery-en-route", "Avec un créneau"),
      variantCase("customer.delivery-en-route", "before", "Livrée avant une heure", (data) => ({
        ...data,
        window: { start: null, end: "08:00" },
      })),
      variantCase("customer.delivery-en-route", "no-window", "Sans créneau ni adresse", (data) => ({
        ...data,
        window: null,
        addressLines: [],
      })),
      variantCase("customer.delivery-en-route", "remainder", "Le reste de la commande", (data) => ({
        ...data,
        remainder: true,
      })),
    ],
    axes: [
      {
        id: "window",
        values: ["between", "before", "none"],
        of: (data) =>
          data.window === null ? "none" : data.window.start === null ? "before" : "between",
      },
      { id: "address", values: PRESENCE, of: (data) => presence(data.addressLines.join("")) },
      { id: "remainder", values: YES_NO, of: (data) => yesNo(data.remainder) },
    ],
  },
  "customer.order-delayed": {
    cases: [
      specimenCase("customer.order-delayed", "Avec le site de retrait"),
      variantCase("customer.order-delayed", "no-site", "Sans site de retrait", (data) => ({
        ...data,
        pickupLabel: null,
      })),
    ],
    axes: [{ id: "pickupLabel", values: PRESENCE, of: (data) => presence(data.pickupLabel) }],
  },
  "customer.order-placed-with-your-email": {
    cases: [
      specimenCase("customer.order-placed-with-your-email", "Avec un prénom"),
      variantCase("customer.order-placed-with-your-email", "anonymous", "Sans prénom", () => ({
        firstName: "",
      })),
    ],
    axes: [{ id: "firstName", values: PRESENCE, of: (data) => presence(data.firstName) }],
  },
  "customer.payment-failed": {
    cases: [
      specimenCase("customer.payment-failed", "Avec le lien pour régler"),
      variantCase("customer.payment-failed", "no-link", "Sans lien", (data) => ({
        ...data,
        settleUrl: "",
      })),
    ],
    axes: [{ id: "settleUrl", values: PRESENCE, of: (data) => presence(data.settleUrl) }],
  },
  "customer.payment-expired": specimenOnly("customer.payment-expired"),
  "customer.order-modification-failed": specimenOnly("customer.order-modification-failed"),
  "customer.order-payment-link": specimenOnly("customer.order-payment-link"),
};
