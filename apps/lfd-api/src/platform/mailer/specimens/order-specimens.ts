import type { ClientSheet } from "@lfd/contracts";

import {
  SPECIMEN_MARK,
  SPECIMEN_PDF_BASE64,
  SPECIMEN_URL,
  type MailSpecimens,
} from "./mail-specimen.types.js";

/** Les exemples des e-mails d'une commande et de son règlement. */

const REFERENCE = `${SPECIMEN_MARK}-0001`;

/** Une commande d'exemple, retirée au Labo, réglée en ligne. Montants en centimes. */
const SHEET: ClientSheet = {
  orderId: "specimen-order",
  reference: REFERENCE,
  audience: "client",
  placedAt: "2026-09-07T06:00:00.000Z",
  requestedFor: "2026-09-08",
  fulfillment: {
    method: "pickup",
    address: {
      label: "Le Labo",
      pays: "France",
      ligne1: "route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
    },
    pickupLabel: "Le Labo",
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: "",
  origin: "self_service",
  issuedAt: "2026-09-07T06:00:00.000Z",
  revision: 0,
  customer: {
    tradeName: `${SPECIMEN_MARK} — Hôtel des Trois Ponts`,
    legalName: `${SPECIMEN_MARK} — SAS des Trois Ponts`,
  },
  variant: "pro",
  customerPhone: null,
  lines: [
    {
      sku: `${SPECIMEN_MARK}-BAG`,
      productName: "Baguette tradition",
      quantity: 12,
      unitPriceMillicents: 120_000,
      vatRate: 0.055,
      lineTotalCents: 1_440,
      unitPriceTtcCents: null,
      lineTotalTtcCents: null,
      priceLabels: [],
    },
  ],
  money: {
    subtotalCents: 1_440,
    discountCents: 144,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 71,
    vatShares: [{ rate: 5.5, amountCents: 71 }],
    totalCents: 1_367,
    currency: "EUR",
    settlement: "paid",
  },
};

const ORDER_URL = `${SPECIMEN_URL}/commande`;
const SETTLE_URL = `${SPECIMEN_URL}/regler`;
const HANDOVER_URL = `${SPECIMEN_URL}/retrait`;
const HANDOVER_TOKEN = "specimen-handover";

export const ORDER_SPECIMENS: Pick<
  MailSpecimens,
  | "customer.order-placed"
  | "customer.order-ready"
  | "customer.delivery-en-route"
  | "customer.order-placed-with-your-email"
  | "customer.payment-failed"
  | "customer.payment-expired"
  | "customer.order-cancelled"
  | "customer.order-payment-link"
> = {
  "customer.order-placed": {
    family: "order",
    data: (locale) => ({
      sheet: SHEET,
      handoverToken: HANDOVER_TOKEN,
      orderUrl: ORDER_URL,
      manageUrl: `${SPECIMEN_URL}/gerer`,
      handoverUrl: HANDOVER_URL,
      document: { fileName: `bon-${REFERENCE}.pdf`, pdfBase64: SPECIMEN_PDF_BASE64 },
      locale,
    }),
  },
  "customer.order-ready": {
    family: "order",
    data: (locale) => ({
      sheet: SHEET,
      handoverToken: HANDOVER_TOKEN,
      orderUrl: ORDER_URL,
      handoverUrl: HANDOVER_URL,
      locale,
    }),
  },
  "customer.delivery-en-route": {
    family: "order",
    data: (locale) => ({
      reference: REFERENCE,
      addressLines: [`${SPECIMEN_MARK} — 1 rue du Col`, "73150 Val d'Isère"],
      orderUrl: ORDER_URL,
      locale,
    }),
  },
  "customer.order-placed-with-your-email": {
    family: "order",
    data: () => ({ firstName: SPECIMEN_MARK }),
  },
  "customer.payment-failed": {
    family: "payment",
    data: (locale) => ({ sheet: SHEET, settleUrl: SETTLE_URL, locale }),
  },
  "customer.payment-expired": {
    family: "payment",
    data: (locale) => ({ sheet: SHEET, locale }),
  },
  "customer.order-cancelled": {
    family: "payment",
    data: (locale) => ({
      sheet: SHEET,
      regime: "paid",
      refund: { announcedCents: SHEET.money.totalCents },
      voucher: null,
      locale,
    }),
  },
  "customer.order-payment-link": {
    family: "payment",
    data: () => ({
      reference: REFERENCE,
      totalCents: SHEET.money.totalCents,
      settleUrl: SETTLE_URL,
    }),
  },
};
