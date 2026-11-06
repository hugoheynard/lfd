import type { MailCases } from "./mail-cases.type.js";

/**
 * Les réponses à une demande de modification (M4) : appliquée — total en
 * hausse, en baisse, inchangé (2026-10-23) —, refusée avec un mot.
 */
export const ORDER_CHANGE_CASES: Pick<
  MailCases,
  "customer.order-change-applied" | "customer.order-change-refused"
> = {
  "customer.order-change-applied": {
    only: { reference: "ORD-4812", totalCents: 4250, previousTotalCents: 3800, locale: "fr" },
    lower: { reference: "ORD-4812", totalCents: 3000, previousTotalCents: 3800, locale: "fr" },
    unchanged: { reference: "ORD-4812", totalCents: 3800, previousTotalCents: 3800, locale: "fr" },
  },
  "customer.order-change-refused": {
    withReason: { reference: "ORD-4812", reason: "La fournée est déjà lancée.", locale: "fr" },
  },
};
