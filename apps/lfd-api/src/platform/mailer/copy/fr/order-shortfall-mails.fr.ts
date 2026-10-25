import type { OrderShortfallMailsCopy } from "../model/order-shortfall-mails.model.js";

/** La famille « départ incomplet », en français — la langue de référence. */
export const ORDER_SHORTFALL_MAILS_FR: OrderShortfallMailsCopy = {
  "customer.order-shortfall": {
    kicker: "Commande incomplète",
    subject: "Commande {ref} : elle part incomplète",
    title: "Votre commande part incomplète.",
    intro:
      "Bonjour,\n\nIl nous manque des articles pour votre commande {ref} : elle part avec ce que nous avons pu préparer.",
    departedHeading: "Ce qui part :",
    missingHeading: "Ce qui manque :",
    line: "– {quantity} × {product}",
    remainderAbandoned: "Le reste ne sera pas livré, et ne vous sera pas facturé.",
    closing: "Toutes nos excuses pour ce manque.",
    footer:
      "Un doute ou une erreur ? Appelez le fournil — Le Labo · route de la Balme, Val d'Isère.",
  },
};
