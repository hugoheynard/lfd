import type { MailCases } from "./mail-cases.type.js";

/** Un particulier dont le total était de 38,00 € TTC (36,02 € HT). */
const PUBLIC = {
  reference: "ORD-4812",
  previousTotalCents: 3800,
  previousPretaxCents: 3602,
  onAccount: false,
  variant: "public",
  locale: "fr",
} as const;

/**
 * Les réponses à une demande de modification (M4) : appliquée — total en
 * hausse, en baisse, inchangé ; pour un pro au compte (HT) et un pro par
 * carte (TTC puis HT) —, refusée avec un mot.
 */
export const ORDER_CHANGE_CASES: Pick<
  MailCases,
  "customer.order-change-applied" | "customer.order-change-refused"
> = {
  "customer.order-change-applied": {
    only: { ...PUBLIC, totalCents: 4250, pretaxCents: 4028 },
    lower: { ...PUBLIC, totalCents: 3000, pretaxCents: 2844 },
    unchanged: { ...PUBLIC, totalCents: 3800, pretaxCents: 3602 },
    proOnAccount: {
      ...PUBLIC,
      variant: "pro",
      onAccount: true,
      totalCents: 4250,
      pretaxCents: 4028,
    },
    proByCard: { ...PUBLIC, variant: "pro", totalCents: 3000, pretaxCents: 2844 },
  },
  "customer.order-change-refused": {
    withReason: { reference: "ORD-4812", reason: "La fournée est déjà lancée.", locale: "fr" },
  },
};
