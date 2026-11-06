import type { MailCases } from "./mail-cases.type.js";

/** « Écrire au client » (E6d) : le texte relu par l'équipe, rendu tel quel. */
export const ORDER_SHORTFALL_CASES: Pick<MailCases, "customer.order-shortfall"> = {
  "customer.order-shortfall": {
    withMessage: {
      reference: "ORD-4812",
      message: "Bonjour,\n\nIl nous manque deux croissants : le reste ne sera pas livré.",
      locale: "fr",
    },
  },
};
