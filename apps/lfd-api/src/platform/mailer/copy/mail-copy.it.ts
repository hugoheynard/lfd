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
  deliveryEnRoute: {
    subject: "La sua consegna è in viaggio",
    title: "La sua consegna è in viaggio.",
    intro: "Il suo corriere è partito, arriverà in giornata.",
    referenceLabel: "Ordine",
    addressLabel: "Consegna a",
    cta: "Vedere il mio ordine",
    footer: "Le Labo · route de la Balme, Val d'Isère — 7 – 19",
  },
  paymentFailed: {
    subject: "Pagamento rifiutato — il suo ordine {ref}",
    kicker: "Pagamento rifiutato",
    title: "Il suo pagamento non è andato a buon fine.",
    intro: "La sua banca ha rifiutato il pagamento di questo ordine.",
    consequence:
      "Il suo ordine non entra quindi in produzione e nulla la attende al banco. " +
      "Riprenda il pagamento qui sotto per rilanciarlo.",
    amountLabel: "Importo da saldare",
    cta: "Riprendere il pagamento",
    footer: "Un dubbio o un errore? Ci chiami — Le Labo · route de la Balme, Val d'Isère.",
  },
  paymentExpired: {
    subject: "Ordine {ref} annullato — pagamento non riuscito",
    kicker: "Ordine annullato",
    title: "Il suo pagamento non è riuscito in tempo.",
    intro: "Il pagamento di questo ordine non è riuscito prima della preparazione dell'infornata.",
    consequence:
      "Il suo ordine è quindi annullato e nulla è stato addebitato. " +
      "Se ne ha ancora bisogno, effettui un nuovo ordine.",
    amountLabel: "Importo non addebitato",
    footer: "Un dubbio o un errore? Ci chiami — Le Labo · route de la Balme, Val d'Isère.",
  },
  invoiceIssued: {
    title: "La sua fattura {number}",
    subject: "{title} — {seller}",
    greeting: "Buongiorno,",
    intro:
      "{seller} ha emesso la fattura {number} intestata a {buyer}{period}, per un importo di {total} IVA inclusa.",
    periodClause: " per gli ordini di {period}",
    attachedNote:
      "È allegata a questo messaggio in formato PDF Factur-X: il suo software di contabilità può leggerne i dati.",
    invoiceLabel: "Fattura",
    dateLabel: "Data",
    periodLabel: "Periodo",
    addressedToLabel: "Intestata a",
    dueLabel: "Scadenza",
    paymentLabel: "Pagamento",
    totalLabel: "Totale IVA inclusa",
    cta: "Vedi le mie fatture",
    footer:
      "Questa fattura è consultabile in qualsiasi momento nella sua area clienti, sezione «Le mie fatture». Per qualsiasi domanda, risponda a questo messaggio.",
  },
};
