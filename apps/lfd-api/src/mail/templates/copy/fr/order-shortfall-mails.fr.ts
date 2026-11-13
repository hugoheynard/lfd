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
    cardWillBeRefunded: "Le reste vous sera remboursé sur votre carte.",
    contactSales: "Contactez le service commercial.",
    closing: "Toutes nos excuses pour ce manque.",
    footer: "Un doute ou une erreur ? Appelez le fournil.",
  },
  "customer.order-shortfall-refunded": {
    kicker: "Remboursement",
    subject: "Commande {ref} : le reste vous est remboursé",
    title: "Le reste de votre commande vous est remboursé.",
    intro:
      "{amount} vous ont été remboursés sur votre carte, pour ce qui n'a pas pu partir avec votre commande {ref}.",
    delay: "Selon votre banque, le montant apparaît sur votre compte sous quelques jours.",
    amountLabel: "Montant remboursé",
    footer: "Un doute ou une erreur ? Appelez le fournil.",
  },
};
