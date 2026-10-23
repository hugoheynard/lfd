import type { PaymentMailsCopy } from "../model/payment-mails.model.js";

/** La famille « paiement et annulation », en français — la langue de référence. */
export const PAYMENT_MAILS_FR: PaymentMailsCopy = {
  "customer.payment-failed": {
    subject: "Paiement refusé — votre commande {ref}",
    kicker: "Paiement refusé",
    title: "Votre paiement n'est pas passé.",
    intro: "Votre banque a refusé le règlement de cette commande.",
    // 🔴 La phrase qui décide : sans elle, on ne sait pas s'il faut repasser
    // commande, attendre, ou se présenter au comptoir.
    consequence:
      "Votre commande n'entre donc pas en fabrication, et rien ne vous attend au comptoir. " +
      "Reprenez le règlement ci-dessous pour la relancer.",
    amountLabel: "Montant à régler",
    cta: "Reprendre le règlement",
    footer:
      "Un doute ou une erreur ? Appelez le fournil — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.payment-expired": {
    subject: "Commande {ref} annulée — paiement non abouti",
    kicker: "Commande annulée",
    title: "Votre paiement n'a pas abouti à temps.",
    intro: "Le règlement de cette commande n'a pas abouti avant la préparation de la fournée.",
    consequence:
      "Votre commande est donc annulée, et rien n'a été débité. " +
      "Si vous en avez toujours besoin, passez une nouvelle commande.",
    amountLabel: "Montant non débité",
    footer:
      "Un doute ou une erreur ? Appelez le fournil — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.order-payment-link": {
    subject: "Votre commande {ref} reste à régler",
    title: "Votre commande attend son règlement",
    intro: "Le règlement de votre commande {ref} ne nous est pas encore parvenu.",
    howToPay: "Vous pouvez la régler par carte depuis votre espace, en suivant le lien ci-dessous.",
    amountLabel: "Montant à régler",
    cta: "Régler ma commande",
    footer:
      "Déjà réglée ? Les deux messages se sont croisés : ignorez celui-ci. " +
      "Un doute ? Répondez à cet e-mail.",
  },
  "customer.order-cancelled": {
    subject: "Commande {ref} annulée",
    title: "Votre commande a été annulée.",
    intro: "Votre commande {ref} pour le {day} a été annulée par notre équipe.",
    introWithoutDay: "Votre commande {ref} a été annulée par notre équipe.",
    introBySelf: "Vous avez annulé votre commande {ref} pour le {day}.",
    introBySelfWithoutDay: "Vous avez annulé votre commande {ref}.",
    introByMember: "{name} a annulé la commande {ref} de {company} pour le {day}.",
    introByMemberWithoutDay: "{name} a annulé la commande {ref} de {company}.",
    introByPrincipal:
      "La commande {ref} pour le {day} a été annulée par {name}, du compte principal {principal}.",
    introByPrincipalWithoutDay:
      "La commande {ref} a été annulée par {name}, du compte principal {principal}.",
    nothingBilled: "Rien ne vous sera facturé pour cette commande.",
    nothingCharged: "Aucun paiement n'a été prélevé.",
    nothingInvoiced: "Rien ne sera facturé ni prélevé pour cette commande.",
    refundToCard:
      "Le montant de {amount} payé par carte, qui ne vous a pas déjà été remboursé, vous sera remboursé sur cette même carte. Selon votre banque, il apparaît sous 5 à 10 jours ouvrés.",
    alreadyRefunded: "Le paiement de cette commande vous a déjà été remboursé.",
    voucherReturned:
      "Votre bon de fidélité de {value} vous est rendu : vous pourrez l'utiliser sur une prochaine commande jusqu'au {day}.",
    voucherMerged:
      "Votre bon de fidélité retrouve sa valeur de {value}, valable jusqu'au {day}. Le bon de {remainder} qui vous avait été remis en reliquat est remplacé par celui-ci.",
    footer:
      "Un doute ou une erreur ? Appelez le fournil — Le Labo · route de la Balme, Val d'Isère.",
  },
};
