import type { MailCopy } from "./mail-copy.model.js";

/**
 * La langue de référence — celle que la maquette écrit, et celle dont les deux
 * autres sont la traduction. Les phrases sont reprises **mot pour mot** de
 * l'écran de confirmation : un courriel qui recompose l'information fait douter
 * qu'il parle de la même commande.
 */
export const MAIL_FR: MailCopy = {
  orderPlaced: {
    subject: "Votre commande {ref} — La Folie Coffee",
    kicker: "Confirmée",
    title: {
      paid: "C'est réglé.",
      due: "Commande enregistrée.",
      account: "Commande enregistrée.",
    },
    intro: "Votre commande entre dans la fournée de demain matin.",
    totalLabel: {
      paid: "Réglé en ligne",
      due: "Reste à régler",
      account: "Porté à votre compte",
    },
    recapPickup: "Retrait",
    recapDelivery: "Livraison",
    recapContent: "Contenu",
    recapPieces: "{count} pièces",
    recapDiscount: "Remise",
    recapVat: "dont TVA",
    qrTitle: "Votre code de retrait",
    qrLine: "Présentez ce code au comptoir. C'est le scan de l'équipe qui atteste la remise.",
    cta: "Voir ma commande",
    changeNote: "Un changement ? Appelez le fournil — une commande passée entre en fabrication.",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 h – 19 h",
  },
  orderReady: {
    subject: "Votre commande {ref} est prête",
    kicker: "Prête",
    titlePickup: "C'est prêt.",
    titleDelivery: "C'est prêt à partir.",
    introPickup: "Votre commande vous attend au comptoir.",
    introDelivery: "Votre commande part vers vous.",
    whereLabel: "À retirer",
    contentLabel: "Contenu",
    piecesLabel: "{count} pièces",
    qrTitle: "Votre code de retrait",
    qrLine: "Présentez ce code au comptoir. C'est le scan de l'équipe qui atteste la remise.",
    cta: "Voir ma commande",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 h – 19 h",
  },
};
