import type { MailCases } from "./mail-cases.type.js";
import { sheet } from "./order-cases.js";

const PAID = sheet();
const ACCOUNT = sheet({ money: { ...PAID.money, settlement: "account" } });
const PUBLIC = sheet({ variant: "public" });
const PDF = { fileName: "bon-ORD-4812-r2.pdf", pdfBase64: "JVBERi0=" };
const URL = "https://app.lfc.test/mes-commandes/order_1";

/**
 * « Votre commande est modifiée » : une phrase sur l'argent par cas — au
 * compte, hausse par carte, baisse par carte, total égal — et un total écrit
 * par clientèle et règlement : HT seul au compte, TTC puis HT d'un pro par
 * carte, TTC seul d'un particulier ou d'un fait sans HT.
 */
export const ORDER_REVISED_CASES: Pick<MailCases, "customer.order-revised"> = {
  "customer.order-revised": {
    account: {
      sheet: ACCOUNT,
      previousTotalCents: 3_800,
      totalCents: 4_250,
      previousPretaxCents: 3_602,
      pretaxCents: 4_028,
      moneyNote: "invoice",
      orderUrl: URL,
      document: PDF,
      locale: "fr",
    },
    cardCharged: {
      sheet: PAID,
      previousTotalCents: 3_800,
      totalCents: 4_250,
      previousPretaxCents: 3_602,
      pretaxCents: 4_028,
      moneyNote: "card_charged",
      orderUrl: URL,
      document: PDF,
      locale: "fr",
    },
    cardRefunded: {
      sheet: PAID,
      previousTotalCents: 4_250,
      totalCents: 3_800,
      previousPretaxCents: 4_028,
      pretaxCents: 3_602,
      moneyNote: "card_refunded",
      orderUrl: URL,
      document: PDF,
      locale: "fr",
    },
    publicCardCharged: {
      sheet: PUBLIC,
      previousTotalCents: 3_800,
      totalCents: 4_250,
      previousPretaxCents: 3_602,
      pretaxCents: 4_028,
      moneyNote: "card_charged",
      orderUrl: URL,
      document: PDF,
      locale: "fr",
    },
    proWithoutPretax: {
      sheet: PAID,
      previousTotalCents: 3_800,
      totalCents: 4_250,
      previousPretaxCents: null,
      pretaxCents: null,
      moneyNote: "card_charged",
      orderUrl: URL,
      document: PDF,
      locale: "fr",
    },
    unchangedBare: {
      sheet: PAID,
      previousTotalCents: 3_800,
      totalCents: 3_800,
      previousPretaxCents: 3_602,
      pretaxCents: 3_602,
      moneyNote: "none",
      orderUrl: "",
      document: null,
      locale: "fr",
    },
  },
};
