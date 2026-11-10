import { KICKER, SUBJECT, texts, variants, type MailLayouts } from "./mail-layout.types.js";

/**
 * Les deux réponses à une demande de modification de commande (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)), adressées au
 * client. Le mot de l'équipe, dans un refus, est une DONNÉE : seul son
 * libellé se réécrit (section « Récapitulatif »).
 */
export const ORDER_CHANGE_MAIL_LAYOUTS: Readonly<
  Pick<
    MailLayouts,
    "customer.order-change-applied" | "customer.order-change-refused" | "customer.order-revised"
  >
> = {
  // Le récapitulatif reprend celui de la passation : ses libellés sont ceux
  // de `customer.order-placed`, des blocs système, rien à réécrire ici.
  "customer.order-revised": {
    ctaDestination:
      "la page de CETTE commande : dans son espace client s'il a un compte, sa page sans compte (lien signé, 90 jours) s'il a commandé en invité ; absent quand l'adresse de la boutique n'est pas configurée",
    subject: SUBJECT,
    header: KICKER,
    sections: [
      { id: "title", texts: texts("title") },
      {
        id: "body",
        texts: [
          ...texts("intro"),
          ...variants({ totalShift: "Total changé", sameTotal: "Total inchangé" }),
          ...variants({
            invoice: "Au compte ou à total nul",
            cardCharged: "Carte, total en hausse",
            cardRefunded: "Carte, total en baisse",
          }),
        ],
      },
      { id: "summary", texts: [] },
      { id: "cta", texts: texts("cta") },
      { id: "footer", texts: texts("footer") },
    ],
  },
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
