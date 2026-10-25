import type { OrderMailsCopy } from "../model/order-mails.model.js";

/** La famille « commande », en italien. Traduction du français, pas une variante. */
export const ORDER_MAILS_IT: OrderMailsCopy = {
  "customer.order-placed": {
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
    recapDiscount: "Sconto ritiro",
    recapDiscountBase: "su {base} idonei",
    recapVoucher: "Buono fedeltà",
    recapVat: "IVA inclusa",
    totalPretax: "Addebitato sul suo conto, IVA esclusa",
    recapTaxLater: "IVA e totale IVA inclusa",
    recapTaxLaterValue: "sulla fattura del mese",
    qrTitle: "Il suo codice di ritiro",
    qrLine: "Mostri questo codice al banco. È la scansione del team che attesta la consegna.",
    cta: "Vedere il mio ordine",
    changeNote:
      "Un cambiamento? Chiami il laboratorio — un ordine effettuato entra subito in produzione.",
    manageLink: "Gestire o annullare il mio ordine",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 – 19",
    qrAlt: "Il suo codice di ritiro — {ref}",
    itinerary: "Indicazioni per il negozio",
  },
  "customer.order-ready": {
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
    qrAlt: "Il suo codice di ritiro — {ref}",
    itinerary: "Indicazioni per il negozio",
  },
  "customer.delivery-en-route": {
    kicker: "Consegna in arrivo",
    subject: "La sua consegna è in viaggio",
    title: "La sua consegna è in viaggio.",
    intro: "Il suo corriere è partito, arriverà in giornata.",
    referenceLabel: "Ordine",
    addressLabel: "Consegna a",
    cta: "Vedere il mio ordine",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 – 19",
  },
  "customer.order-placed-with-your-email": {
    kicker: "Ordine effettuato",
    subject: "È appena stato effettuato un ordine con il suo indirizzo",
    title: "Buongiorno, {firstName}",
    titleWithoutName: "Buongiorno",
    intro:
      "È appena stato effettuato un ordine sul nostro negozio indicando il suo indirizzo " +
      "e-mail, senza passare dal suo account.",
    ifItIsYou:
      "Se è stato lei, non c'è nulla da fare: la conferma e il codice di ritiro sono " +
      "stati inviati a questo stesso indirizzo.",
    footer:
      "Se non è stato lei, probabilmente qualcuno ha digitato il suo indirizzo per errore. " +
      "Nessun accesso al suo account è stato aperto e nulla è stato modificato. " +
      "Risponda a questa e-mail se desidera che verifichiamo.",
  },
};
