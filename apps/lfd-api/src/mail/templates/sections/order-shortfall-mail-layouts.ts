import { KICKER, SUBJECT, texts, type MailLayouts } from "./mail-layout.types.js";

/**
 * « Écrire au client » après un départ incomplet (plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)). Les « Paragraphes »
 * sont la PROPOSITION que l'équipe relit : le courriel rend le texte relu,
 * une donnée — d'où leur place à part dans `mail-layouts.spec.ts`.
 */
export const ORDER_SHORTFALL_MAIL_LAYOUTS: Readonly<
  Pick<MailLayouts, "customer.order-shortfall" | "customer.order-shortfall-refunded">
> = {
  "customer.order-shortfall": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        label: "Proposition, relue et corrigée avant l'envoi",
        texts: texts(
          "intro",
          "departedHeading",
          "missingHeading",
          "line",
          "cardWillBeRefunded",
          "contactSales",
          "closing",
        ),
      },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-shortfall-refunded": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "delay") },
      { id: "summary", texts: texts("amountLabel") },
      { id: "footer", texts: texts("footer") },
    ],
  },
};
