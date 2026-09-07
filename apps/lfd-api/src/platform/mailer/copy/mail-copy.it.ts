import type { MailCopy } from "./mail-copy.model.js";

/**
 * L'italien. Traduction de {@link MAIL_FR}, pas une variante : si une phrase
 * française change de sens, celle-ci doit changer avec elle.
 */
export const MAIL_IT: MailCopy = {
  orderPlaced: {
    subject: "Il suo ordine {ref} — La Folie Coffee",
    kicker: "Confermato",
    title: {
      paid: "È tutto pagato.",
      due: "Ordine registrato.",
      account: "Ordine registrato.",
    },
    intro: "Il suo ordine entra nella infornata di domani mattina.",
    totalLabel: {
      paid: "Pagato online",
      due: "Ancora da pagare",
      account: "Addebitato sul suo conto",
    },
    recapPickup: "Ritiro",
    recapDelivery: "Consegna",
    recapContent: "Contenuto",
    recapPieces: "{count} pezzi",
    recapDiscount: "Sconto",
    recapVat: "IVA inclusa",
    qrTitle: "Il suo codice di ritiro",
    qrLine: "Mostri questo codice al banco. È la scansione del team che attesta la consegna.",
    cta: "Vedere il mio ordine",
    changeNote:
      "Un cambiamento? Chiami il laboratorio — un ordine effettuato entra subito in produzione.",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 – 19",
  },
  orderReady: {
    subject: "Il suo ordine {ref} è pronto",
    kicker: "Pronto",
    titlePickup: "È pronto.",
    titleDelivery: "Pronto per la partenza.",
    introPickup: "Il suo ordine la aspetta al banco.",
    introDelivery: "Il suo ordine sta arrivando da lei.",
    whereLabel: "Da ritirare",
    contentLabel: "Contenuto",
    piecesLabel: "{count} pezzi",
    qrTitle: "Il suo codice di ritiro",
    qrLine: "Mostri questo codice al banco. È la scansione del team che attesta la consegna.",
    cta: "Vedere il mio ordine",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 – 19",
  },
};
