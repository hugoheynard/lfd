import { SPECIMEN_MARK, type MailSpecimens } from "./mail-specimen.types.js";

/** Les exemples des réponses à une demande de modification (plan de modification, M4). */
const REFERENCE = `${SPECIMEN_MARK}-0001`;

export const ORDER_CHANGE_SPECIMENS: Readonly<
  Pick<MailSpecimens, "customer.order-change-applied" | "customer.order-change-refused">
> = {
  "customer.order-change-applied": {
    family: "order",
    data: (locale) => ({ reference: REFERENCE, locale }),
  },
  "customer.order-change-refused": {
    family: "order",
    data: (locale) => ({
      reference: REFERENCE,
      reason:
        "La fournée de ce jour est déjà lancée : nous pouvons ajouter ces articles au lendemain.",
      locale,
    }),
  },
};
