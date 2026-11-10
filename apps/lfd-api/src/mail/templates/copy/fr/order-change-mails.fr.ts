import type { OrderChangeMailsCopy } from "../model/order-change-mails.model.js";

/** La famille « demande de modification », en français — la langue de référence. */
export const ORDER_CHANGE_MAILS_FR: OrderChangeMailsCopy = {
  "customer.order-revised": {
    subject: "Votre commande {ref} est modifiée",
    kicker: "Commande modifiée",
    title: "Votre commande est modifiée.",
    intro: "Votre commande {ref} a été modifiée. Voici son détail à jour.",
    totalShift: "Le total passe de {previous} à {total}.",
    sameTotal: "Le total reste de {total}.",
    pretaxAmount: "{pretax} HT",
    bothAmounts: "{withTax} TTC ({pretax} HT)",
    invoice: "Le nouveau total figurera sur votre facture.",
    cardCharged: "La différence de {amount} a été réglée par carte.",
    cardRefunded: "{amount} vous seront remboursés sur votre carte.",
    cta: "Voir ma commande",
    footer: "Un doute ou une erreur ? Appelez le fournil.",
  },
  "customer.order-change-applied": {
    kicker: "Commande modifiée",
    subject: "Commande {ref} modifiée à votre demande",
    title: "Votre modification est faite.",
    intro: "Nous avons modifié votre commande {ref} comme vous nous l'avez demandé.",
    totalLabel: "Nouveau total TTC",
    moreToPay: "Soit {amount} de plus qu'avant : le total était de {previous}.",
    lessToPay: "Soit {amount} de moins qu'avant : le total était de {previous}.",
    sameTotal: "Le total reste le même qu'avant.",
    where: "La commande à jour se lit dans votre espace, rubrique Mes commandes.",
    footer: "Un doute ou une erreur ? Appelez le fournil.",
  },
  "customer.order-change-refused": {
    kicker: "Demande de modification",
    subject: "Commande {ref} : modification impossible",
    title: "Nous n'avons pas pu modifier votre commande.",
    intro: "Vous nous avez demandé de modifier votre commande {ref} : ce n'est pas possible.",
    reasonLabel: "Le mot de notre équipe",
    contactSales: "Contactez notre service commercial.",
  },
};
