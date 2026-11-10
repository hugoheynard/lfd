import { KICKER, SUBJECT, texts, type MailLayouts } from "./mail-layout.types.js";

/**
 * Les deux réponses à une demande de modification de commande (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)), adressées au
 * client. Le mot de l'équipe, dans un refus, est une DONNÉE : seul son
 * libellé se réécrit (section « Récapitulatif »).
 */
export const ORDER_CHANGE_MAIL_LAYOUTS: Readonly<
  Pick<MailLayouts, "customer.order-change-applied" | "customer.order-change-refused">
> = {
  "customer.order-change-applied": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "moreToPay", "lessToPay", "sameTotal", "where") },
      { id: "summary", texts: texts("totalLabel") },
      { id: "footer", texts: texts("footer") },
    ],
  },
  "customer.order-change-refused": {
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      { id: "body", texts: texts("intro", "contactSales") },
      { id: "summary", texts: texts("reasonLabel") },
    ],
  },
};
