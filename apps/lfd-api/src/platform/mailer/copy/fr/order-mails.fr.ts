import type { OrderMailsCopy } from "../model/order-mails.model.js";

/**
 * La famille « commande », en français — la langue de référence. Les phrases
 * de la confirmation sont reprises **mot pour mot** de l'écran de
 * confirmation : un courriel qui recompose l'information fait douter qu'il
 * parle de la même commande.
 */
export const ORDER_MAILS_FR: OrderMailsCopy = {
  "customer.order-placed": {
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
    recapDiscount: "Remise retrait",
    recapDiscountBase: "sur {base} éligibles",
    recapVoucher: "Bon de fidélité",
    recapVat: "dont TVA",
    totalPretax: "Porté à votre compte, HT",
    recapTaxLater: "TVA et TTC",
    recapTaxLaterValue: "sur la facture du mois",
    qrTitle: "Votre code de retrait",
    qrLine: "Présentez ce code au comptoir. C'est le scan de l'équipe qui atteste la remise.",
    cta: "Voir ma commande",
    changeNote: "Un changement ? Appelez le fournil — une commande passée entre en fabrication.",
    manageLink: "Gérer ou annuler ma commande",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 h – 19 h",
    qrAlt: "Votre code de retrait — {ref}",
    itinerary: "Itinéraire vers la boutique",
  },
  "customer.order-ready": {
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
    qrAlt: "Votre code de retrait — {ref}",
    itinerary: "Itinéraire vers la boutique",
    subjectReminder: "Votre commande {ref} vous attend",
    kickerReminder: "Rappel",
    titleReminder: "Elle vous attend.",
    introReminder: "Votre commande vous attend au point de retrait {site}.",
    introReminderWithoutSite: "Votre commande vous attend au point de retrait.",
    subjectRemainder: "Le reste de votre commande {ref} est prêt",
    kickerRemainder: "Le reste",
    titleRemainderPickup: "Le reste est prêt.",
    titleRemainderDelivery: "Le reste est prêt à partir.",
    introRemainderPickup: "Le reste de votre commande vous attend au comptoir.",
    introRemainderDelivery: "Le reste de votre commande part vers vous.",
  },
  "customer.delivery-en-route": {
    kicker: "Livraison en route",
    subject: "Votre livraison est en route",
    title: "Votre livraison est en route.",
    intro: "Votre livreur est parti, il arrive dans la journée.",
    referenceLabel: "Commande",
    addressLabel: "Livrée à",
    cta: "Voir ma commande",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 h – 19 h",
    subjectRemainder: "Le reste de votre commande est en route",
    titleRemainder: "Le reste de votre commande est en route.",
    introRemainder:
      "Votre livreur est parti avec le reste de votre commande, il arrive dans la journée.",
  },
  "customer.order-delayed": {
    kicker: "Retard",
    subject: "Votre commande {ref} prend du retard",
    title: "Votre commande prend du retard.",
    intro:
      "Elle n'est pas encore prête. Nous vous écrirons dès qu'elle le sera : inutile de vous déplacer d'ici là.",
    referenceLabel: "Commande",
    whereLabel: "À retirer",
    apology: "Toutes nos excuses pour l'attente.",
    cta: "Voir ma commande",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 h – 19 h",
  },
  "customer.order-placed-with-your-email": {
    kicker: "Commande passée",
    subject: "Une commande vient d'être passée avec votre adresse",
    title: "Bonjour, {firstName}",
    titleWithoutName: "Bonjour",
    intro:
      "Une commande vient d'être passée sur notre boutique en indiquant votre adresse " +
      "e-mail, sans passer par votre compte.",
    ifItIsYou:
      "Si c'est vous, il n'y a rien à faire : la confirmation et le code de retrait sont " +
      "partis à cette même adresse.",
    footer:
      "Si ce n'est pas vous, quelqu'un a sans doute tapé votre adresse par erreur. " +
      "Aucun accès à votre compte n'a été ouvert, et rien n'a été modifié. " +
      "Répondez à cet e-mail si vous voulez qu'on regarde.",
  },
};
