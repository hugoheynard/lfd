import type { MailCases } from "./mail-cases.type.js";

/** « Prévenir le client » d'une commande non retirée : avec et sans point de retrait nommé. */
export const ORDER_NOT_COLLECTED_CASES: Pick<MailCases, "customer.order-not-collected"> = {
  "customer.order-not-collected": {
    full: { reference: "ORD-4812", pickupLabel: "Le Labo", locale: "fr" },
    bare: { reference: "ORD-4812", pickupLabel: null, locale: "fr" },
  },
};
