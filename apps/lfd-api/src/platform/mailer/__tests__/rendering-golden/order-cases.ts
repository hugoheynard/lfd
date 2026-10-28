import type { ClientSheet } from "@lfd/contracts";

import type { B2bMails } from "../../mail-templates.js";
import type { MailCases } from "./mail-cases.type.js";

/** Les cas des e-mails d'une commande : confirmation, retrait, livraison, paiement, annulation. */

function sheet(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return {
    orderId: "order_1",
    reference: "ORD-4812",
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
    customer: { tradeName: "Hôtel des Trois Ponts", legalName: "SAS des Trois Ponts" },
    variant: "pro",
    customerPhone: null,
    lines: [
      {
        sku: "PAI-001",
        productName: "Tradition",
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
    ...overrides,
  };
}

const PAID = sheet();

const DELIVERY = sheet({
  fulfillment: { ...PAID.fulfillment, method: "delivery", pickupLabel: null },
  money: { ...PAID.money, discountCents: 0, voucherDiscountCents: 250, settlement: "due" },
});
const ACCOUNT = sheet({ money: { ...PAID.money, settlement: "account" } });
const FREE = sheet({ requestedFor: null, money: { ...PAID.money, settlement: "free" } });

/**
 * Une commande de particulier composée en TTC (`exact_ht`, plan du centime,
 * lot C3) : le pied au format du ticket, « dont TVA » par taux lu sur la part figée.
 */
const EXACT_HT = sheet({
  variant: "public",
  money: {
    ...PAID.money,
    ttcTerms: { discountCents: 152, voucherCents: 0, deliveryFeeCents: 0 },
    ttcByRate: [{ rate: 5.5, htCents: 1_296, vatCents: 71, ttcCents: 1_367 }],
  },
});

const HANDOVER = "https://admin.lfc.test/retrait/tok_abc";
const PDF = { fileName: "bon-ORD-4812.pdf", pdfBase64: "JVBERi0=" };

const CANCELLED: B2bMails["customer.order-cancelled"] = {
  sheet: PAID,
  regime: "paid",
  refund: { announcedCents: 1_367 },
  voucher: null,
  locale: "fr",
};

export const ORDER_CASES: Pick<
  MailCases,
  | "customer.order-placed"
  | "customer.order-ready"
  | "customer.delivery-en-route"
  | "customer.order-delayed"
  | "customer.payment-failed"
  | "customer.payment-expired"
  | "customer.order-cancelled"
  | "customer.order-payment-link"
> = {
  "customer.order-placed": {
    paidPickup: {
      sheet: PAID,
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      manageUrl: "https://shop.lfc.test/annuler#1.x",
      handoverUrl: HANDOVER,
      document: PDF,
      locale: "fr",
    },
    dueDelivery: {
      sheet: DELIVERY,
      handoverToken: null,
      orderUrl: "",
      handoverUrl: "",
      document: null,
      locale: "fr",
    },
    account: {
      sheet: ACCOUNT,
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      manageUrl: "",
      handoverUrl: HANDOVER,
      document: null,
      locale: "fr",
    },
    exactHt: {
      sheet: EXACT_HT,
      handoverToken: null,
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: "",
      document: null,
      locale: "fr",
    },
    free: {
      sheet: FREE,
      handoverToken: null,
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: "",
      document: null,
      locale: "fr",
    },
  },
  "customer.order-ready": {
    pickup: {
      sheet: PAID,
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: HANDOVER,
      locale: "fr",
    },
    delivery: { sheet: DELIVERY, handoverToken: null, orderUrl: "", handoverUrl: "", locale: "fr" },
    reminder: {
      sheet: PAID,
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: HANDOVER,
      locale: "fr",
      reminder: true,
    },
    reminderWithoutSite: {
      sheet: { ...PAID, fulfillment: { ...PAID.fulfillment, pickupLabel: null } },
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: HANDOVER,
      locale: "fr",
      reminder: true,
    },
    remainderPickup: {
      sheet: PAID,
      handoverToken: "tok_abc",
      orderUrl: "https://shop.lfc.test/c/1",
      handoverUrl: HANDOVER,
      locale: "fr",
      remainder: { pieces: 3 },
    },
    remainderDelivery: {
      sheet: DELIVERY,
      handoverToken: null,
      orderUrl: "",
      handoverUrl: "",
      locale: "fr",
      remainder: { pieces: 2 },
    },
  },
  "customer.delivery-en-route": {
    full: {
      reference: "ORD-4812",
      addressLines: ["1 rue du Col", "", "73150 Val d'Isère"],
      window: null,
      orderUrl: "https://shop.lfc.test/c/1",
      locale: "fr",
    },
    bare: { reference: "ORD-4812", addressLines: [], window: null, orderUrl: "", locale: "fr" },
    windowBetween: {
      reference: "ORD-4812",
      addressLines: ["1 rue du Col", "", "73150 Val d'Isère"],
      window: { start: "07:00", end: "09:00" },
      orderUrl: "https://shop.lfc.test/c/1",
      locale: "fr",
    },
    windowBefore: {
      reference: "ORD-4812",
      addressLines: ["1 rue du Col", "", "73150 Val d'Isère"],
      window: { start: null, end: "08:00" },
      orderUrl: "https://shop.lfc.test/c/1",
      locale: "fr",
    },
    remainder: {
      reference: "ORD-4812",
      addressLines: ["1 rue du Col", "", "73150 Val d'Isère"],
      window: null,
      orderUrl: "https://shop.lfc.test/c/1",
      locale: "fr",
      remainder: true,
    },
  },
  "customer.order-delayed": {
    full: {
      reference: "ORD-4812",
      pickupLabel: "Le Labo",
      orderUrl: "https://shop.lfc.test/c/1",
      locale: "fr",
    },
    bare: { reference: "ORD-4812", pickupLabel: null, orderUrl: "", locale: "fr" },
  },
  "customer.payment-failed": {
    withLink: { sheet: PAID, settleUrl: "https://shop.lfc.test/regler", locale: "fr" },
    withoutLink: { sheet: DELIVERY, settleUrl: "", locale: "fr" },
  },
  "customer.payment-expired": { only: { sheet: PAID, locale: "fr" } },
  "customer.order-cancelled": {
    teamPaid: CANCELLED,
    teamAlreadyRefunded: { ...CANCELLED, refund: null, sheet: FREE },
    selfFree: { ...CANCELLED, regime: "free", author: { kind: "self" } },
    selfDueNoDay: { ...CANCELLED, sheet: FREE, regime: "due", author: { kind: "self" } },
    memberAccount: {
      ...CANCELLED,
      regime: "account",
      author: { kind: "member", name: "Jeanne M.", company: "Hôtel des Trois Ponts" },
      voucher: {
        outcome: "returned",
        voucherValueCents: 500,
        remainderValueCents: null,
        expiresAt: "2026-12-31T10:00:00.000Z",
      },
    },
    memberNoDay: {
      ...CANCELLED,
      sheet: FREE,
      author: { kind: "member", name: "Jeanne M.", company: "Hôtel" },
    },
    principalMerged: {
      ...CANCELLED,
      author: { kind: "principal", name: "Paul D.", principal: "Groupe Alpes" },
      voucher: {
        outcome: "merged",
        voucherValueCents: 500,
        remainderValueCents: 120,
        expiresAt: "2026-12-31T10:00:00.000Z",
      },
    },
    principalNoDayLapsed: {
      ...CANCELLED,
      sheet: FREE,
      author: { kind: "principal", name: "Paul D.", principal: "Groupe Alpes" },
      voucher: {
        outcome: "lapsed",
        voucherValueCents: 500,
        remainderValueCents: null,
        expiresAt: "2026-12-31T10:00:00.000Z",
      },
    },
  },
  "customer.order-payment-link": {
    only: { reference: "ORD-4812", totalCents: 1_367, settleUrl: "https://shop.lfc.test/regler" },
  },
};
