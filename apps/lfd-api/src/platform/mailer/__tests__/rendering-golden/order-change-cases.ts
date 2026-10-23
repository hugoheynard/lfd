import type { MailCases } from "./mail-cases.type.js";

/** Les réponses à une demande de modification (M4) : appliquée, refusée avec un mot. */
export const ORDER_CHANGE_CASES: Pick<
  MailCases,
  "customer.order-change-applied" | "customer.order-change-refused"
> = {
  "customer.order-change-applied": { only: { reference: "ORD-4812", locale: "fr" } },
  "customer.order-change-refused": {
    withReason: { reference: "ORD-4812", reason: "La fournée est déjà lancée.", locale: "fr" },
  },
};
