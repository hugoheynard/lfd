import type { ClientSheet } from "@lfd/contracts";

import { orderTotalFormFor } from "../../order-total-form.js";
import { orderTotalFormOf } from "../../order-total-form.js";
import { SPECIMEN_MARK } from "../mail-specimen.types.js";
import { PRESENCE, presence, specimenCase, specimenOnly, variantCase } from "./case-builders.js";
import type { MailCaseTables } from "./mail-specimen-case.types.js";

/** Les cas de l'annulation et des réponses à une commande (modification, manque). */

const MEMBER = `${SPECIMEN_MARK} — Jeanne M.`;
const PRINCIPAL = `${SPECIMEN_MARK} — Groupe des Alpes`;
const COMPANY = `${SPECIMEN_MARK} — Hôtel des Trois Ponts`;
/** La date limite d'un bon d'exemple : une donnée mise en forme, jamais comparée à l'horloge. */
const VOUCHER_EXPIRY = "2026-12-31T10:00:00.000Z";

/** Les quatre phrases sur l'argent d'une commande modifiée. */
const REVISED_MONEY_NOTES = ["card_charged", "invoice", "card_refunded", "none"] as const;

function withoutDay(sheet: ClientSheet): ClientSheet {
  return { ...sheet, requestedFor: null, money: { ...sheet.money, settlement: "free" } };
}

export const ORDER_ANSWER_CASE_TABLES: Pick<
  MailCaseTables,
  | "customer.order-cancelled"
  | "customer.order-change-applied"
  | "customer.order-change-refused"
  | "customer.order-revised"
  | "customer.order-shortfall"
  | "customer.order-shortfall-refunded"
> = {
  "customer.order-cancelled": {
    cases: [
      specimenCase("customer.order-cancelled", "Par l'équipe, payée et remboursée"),
      variantCase(
        "customer.order-cancelled",
        "self-free",
        "Par le client, gratuite, sans jour",
        (data) => ({
          ...data,
          sheet: withoutDay(data.sheet),
          regime: "free",
          refund: null,
          author: { kind: "self" },
        }),
      ),
      variantCase("customer.order-cancelled", "self-due", "Par le client, à régler", (data) => ({
        ...data,
        regime: "due",
        refund: null,
        author: { kind: "self" },
      })),
      variantCase(
        "customer.order-cancelled",
        "member-account",
        "Par un membre, au compte, bon rendu",
        (data) => ({
          ...data,
          regime: "account",
          refund: null,
          author: { kind: "member", name: MEMBER, company: COMPANY },
          voucher: {
            outcome: "returned",
            voucherValueCents: 500,
            remainderValueCents: null,
            expiresAt: VOUCHER_EXPIRY,
          },
        }),
      ),
      variantCase(
        "customer.order-cancelled",
        "principal-merged",
        "Par le compte principal, bon fusionné",
        (data) => ({
          ...data,
          author: { kind: "principal", name: MEMBER, principal: PRINCIPAL },
          voucher: {
            outcome: "merged",
            voucherValueCents: 500,
            remainderValueCents: 120,
            expiresAt: VOUCHER_EXPIRY,
          },
        }),
      ),
      variantCase(
        "customer.order-cancelled",
        "voucher-lapsed",
        "Déjà remboursée, bon échu",
        (data) => ({
          ...data,
          refund: null,
          voucher: {
            outcome: "lapsed",
            voucherValueCents: 500,
            remainderValueCents: null,
            expiresAt: VOUCHER_EXPIRY,
          },
        }),
      ),
    ],
    axes: [
      {
        id: "author",
        values: ["team", "self", "member", "principal"],
        of: (data) => data.author?.kind ?? "team",
      },
      { id: "regime", values: ["paid", "due", "account", "free"], of: (data) => data.regime },
      {
        id: "refund",
        values: ["announced", "none"],
        of: (data) => (data.refund === null || data.refund === undefined ? "none" : "announced"),
      },
      {
        id: "voucher",
        values: ["none", "returned", "merged", "lapsed"],
        of: (data) => data.voucher?.outcome ?? "none",
      },
      { id: "day", values: PRESENCE, of: (data) => presence(data.sheet.requestedFor) },
    ],
  },
  "customer.order-change-applied": {
    cases: [
      specimenCase("customer.order-change-applied", "Total en hausse"),
      variantCase("customer.order-change-applied", "lower", "Total en baisse", (data) => ({
        ...data,
        totalCents: data.previousTotalCents - 800,
        pretaxCents: data.previousPretaxCents - 758,
      })),
      variantCase("customer.order-change-applied", "unchanged", "Total inchangé", (data) => ({
        ...data,
        totalCents: data.previousTotalCents,
        pretaxCents: data.previousPretaxCents,
      })),
      variantCase(
        "customer.order-change-applied",
        "proOnAccount",
        "Pro au compte (HT)",
        (data) => ({
          ...data,
          variant: "pro",
          onAccount: true,
        }),
      ),
      variantCase(
        "customer.order-change-applied",
        "proByCard",
        "Pro par carte (TTC puis HT)",
        (data) => ({
          ...data,
          variant: "pro",
        }),
      ),
    ],
    axes: [
      {
        id: "total",
        values: ["higher", "lower", "unchanged"],
        of: (data) =>
          data.totalCents > data.previousTotalCents
            ? "higher"
            : data.totalCents < data.previousTotalCents
              ? "lower"
              : "unchanged",
      },
      {
        id: "form",
        values: ["pretax", "both", "with_tax"],
        of: (data) => orderTotalFormFor(data.onAccount, data.variant),
      },
    ],
  },
  "customer.order-change-refused": specimenOnly("customer.order-change-refused"),
  "customer.order-revised": {
    cases: [
      specimenCase("customer.order-revised", "Pro par carte, hausse réglée"),
      variantCase("customer.order-revised", "public", "Particulier, hausse réglée", (data) => ({
        ...data,
        sheet: { ...data.sheet, variant: "public" },
      })),
      variantCase("customer.order-revised", "account", "Pro au compte, total changé", (data) => ({
        ...data,
        sheet: { ...data.sheet, money: { ...data.sheet.money, settlement: "account" } },
        moneyNote: "invoice",
      })),
      variantCase("customer.order-revised", "refund", "Carte, baisse remboursée", (data) => ({
        ...data,
        previousTotalCents: data.totalCents + 800,
        previousPretaxCents: data.pretaxCents === null ? null : data.pretaxCents + 758,
        moneyNote: "card_refunded",
      })),
      variantCase("customer.order-revised", "unchanged", "Total inchangé", (data) => ({
        ...data,
        previousTotalCents: data.totalCents,
        previousPretaxCents: data.pretaxCents,
        moneyNote: "none",
      })),
    ],
    axes: [
      { id: "money", values: REVISED_MONEY_NOTES, of: (data) => data.moneyNote },
      {
        id: "total",
        values: ["both", "pretax", "with_tax"],
        of: (data) => orderTotalFormOf(data.sheet),
      },
    ],
  },
  "customer.order-shortfall": specimenOnly("customer.order-shortfall"),
  "customer.order-shortfall-refunded": specimenOnly("customer.order-shortfall-refunded"),
};
