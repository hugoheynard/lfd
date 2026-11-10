import type { OrderChangeMailsCopy } from "../model/order-change-mails.model.js";

/** La famiglia « richiesta di modifica », in italiano. */
export const ORDER_CHANGE_MAILS_IT: OrderChangeMailsCopy = {
  "customer.order-revised": {
    subject: "Il suo ordine {ref} è stato modificato",
    kicker: "Ordine modificato",
    title: "Il suo ordine è stato modificato.",
    intro: "Il suo ordine {ref} è stato modificato. Ecco il dettaglio aggiornato.",
    totalShift: "Il totale passa da {previous} a {total}.",
    sameTotal: "Il totale resta di {total}.",
    pretaxAmount: "{pretax} IVA esclusa",
    bothAmounts: "{withTax} IVA inclusa ({pretax} IVA esclusa)",
    invoice: "Il nuovo totale comparirà sulla sua fattura.",
    cardCharged: "La differenza di {amount} è stata pagata con carta.",
    cardRefunded: "{amount} le verranno rimborsati sulla carta.",
    cta: "Vedi il mio ordine",
    footer: "Un dubbio o un errore? Chiama il laboratorio.",
  },
  "customer.order-change-applied": {
    kicker: "Ordine modificato",
    subject: "Ordine {ref} modificato su tua richiesta",
    title: "La tua modifica è fatta.",
    intro: "Abbiamo modificato il tuo ordine {ref} come ci hai chiesto.",
    totalLabel: "Nuovo totale IVA inclusa",
    moreToPay: "Cioè {amount} in più di prima: il totale era {previous}.",
    lessToPay: "Cioè {amount} in meno di prima: il totale era {previous}.",
    sameTotal: "Il totale resta lo stesso di prima.",
    where: "L'ordine aggiornato si legge nel tuo spazio, alla voce I miei ordini.",
    footer: "Un dubbio o un errore? Chiama il laboratorio.",
  },
  "customer.order-change-refused": {
    kicker: "Richiesta di modifica",
    subject: "Ordine {ref}: modifica impossibile",
    title: "Non abbiamo potuto modificare il tuo ordine.",
    intro: "Ci hai chiesto di modificare il tuo ordine {ref}: non è possibile.",
    reasonLabel: "Una parola dal nostro team",
    contactSales: "Contatta il nostro servizio commerciale.",
  },
};
