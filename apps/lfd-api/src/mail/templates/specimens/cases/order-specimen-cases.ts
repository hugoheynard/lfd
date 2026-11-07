import type { ClientSheet, SettlementRegime } from "@lfd/contracts";

import { SPECIMEN_MARK } from "../mail-specimen.types.js";
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

function settled(sheet: ClientSheet, settlement: SettlementRegime): ClientSheet {
  return { ...sheet, money: { ...sheet.money, settlement } };
}

/** Livrée plutôt que retirée : plus de site de retrait. */
function delivered(sheet: ClientSheet): ClientSheet {
  return {
    ...sheet,
    fulfillment: { ...sheet.fulfillment, method: "delivery", pickupLabel: null },
  };
}

/** Une commande de particulier, composée en TTC : le pied au format du ticket. */
function publicTtc(sheet: ClientSheet): ClientSheet {
  const money = sheet.money;
  return {
    ...sheet,
    variant: "public",
    customer: { tradeName: "", legalName: `${SPECIMEN_MARK} — Jeanne Martin` },
    money: {
      ...money,
      ttcTerms: { discountCents: 152, voucherCents: 0, deliveryFeeCents: 0 },
      ttcByRate: [
        {
          rate: 5.5,
          htCents: money.pretaxCents,
          vatCents: money.vatCents,
          ttcCents: money.totalCents,
        },
      ],
    },
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
  | "customer.order-payment-link"
> = {
  "customer.order-placed": {
    cases: [
      specimenCase("customer.order-placed", "Retrait, payée en ligne"),
      variantCase("customer.order-placed", "due-delivery", "Livraison, à régler", (data) => ({
        ...data,
        sheet: settled(delivered(data.sheet), "due"),
        handoverToken: null,
        handoverUrl: "",
        document: null,
      })),
      variantCase("customer.order-placed", "account", "Au compte", (data) => ({
        ...data,
        sheet: settled(data.sheet, "account"),
        manageUrl: "",
      })),
      variantCase(
        "customer.order-placed",
        "free-no-day",
        "Gratuite, sans jour demandé",
        (data) => ({
          ...data,
          sheet: { ...settled(data.sheet, "free"), requestedFor: null },
          handoverToken: null,
          handoverUrl: "",
        }),
      ),
      variantCase("customer.order-placed", "public-ttc", "Particulier, prix TTC", (data) => ({
        ...data,
        sheet: publicTtc(data.sheet),
      })),
    ],
    axes: [
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
  "customer.order-payment-link": specimenOnly("customer.order-payment-link"),
};
