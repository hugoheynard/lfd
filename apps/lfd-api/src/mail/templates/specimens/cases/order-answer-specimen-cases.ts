import type { ClientSheet } from "@lfd/contracts";

import { SPECIMEN_MARK } from "../mail-specimen.types.js";
import { PRESENCE, presence, specimenCase, specimenOnly, variantCase } from "./case-builders.js";
import type { MailCaseTables } from "./mail-specimen-case.types.js";

/** Les cas de l'annulation et des réponses à une commande (modification, manque). */

const MEMBER = `${SPECIMEN_MARK} — Jeanne M.`;
const PRINCIPAL = `${SPECIMEN_MARK} — Groupe des Alpes`;
const COMPANY = `${SPECIMEN_MARK} — Hôtel des Trois Ponts`;
/** La date limite d'un bon d'exemple : une donnée mise en forme, jamais comparée à l'horloge. */
const VOUCHER_EXPIRY = "2026-12-31T10:00:00.000Z";

function withoutDay(sheet: ClientSheet): ClientSheet {
  return { ...sheet, requestedFor: null, money: { ...sheet.money, settlement: "free" } };
}

export const ORDER_ANSWER_CASE_TABLES: Pick<
  MailCaseTables,
  | "customer.order-cancelled"
  | "customer.order-change-applied"
  | "customer.order-change-refused"
  | "customer.order-shortfall"
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
      })),
      variantCase("customer.order-change-applied", "unchanged", "Total inchangé", (data) => ({
        ...data,
        totalCents: data.previousTotalCents,
      })),
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
    ],
  },
  "customer.order-change-refused": specimenOnly("customer.order-change-refused"),
  "customer.order-shortfall": specimenOnly("customer.order-shortfall"),
};
