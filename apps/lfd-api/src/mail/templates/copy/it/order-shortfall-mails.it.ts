import type { OrderShortfallMailsCopy } from "../model/order-shortfall-mails.model.js";

/** La famiglia « partenza incompleta », in italiano. */
export const ORDER_SHORTFALL_MAILS_IT: OrderShortfallMailsCopy = {
  "customer.order-shortfall": {
    kicker: "Ordine incompleto",
    subject: "Ordine {ref}: parte incompleto",
    title: "Il tuo ordine parte incompleto.",
    intro:
      "Buongiorno,\n\nCi mancano alcuni articoli per il tuo ordine {ref}: parte con ciò che abbiamo potuto preparare.",
    departedHeading: "Ciò che parte:",
    missingHeading: "Ciò che manca:",
    line: "– {quantity} × {product}",
    cardWillBeRefunded: "Il resto ti sarà rimborsato sulla carta.",
    contactSales: "Contatta il servizio commerciale.",
    closing: "Ci scusiamo per gli articoli mancanti.",
    footer: "Un dubbio o un errore? Chiama il forno.",
  },
  "customer.order-shortfall-refunded": {
    kicker: "Rimborso",
    subject: "Ordine {ref}: il resto ti è rimborsato",
    title: "Il resto del tuo ordine ti è rimborsato.",
    intro:
      "{amount} ti sono stati rimborsati sulla carta, per ciò che non è potuto partire con il tuo ordine {ref}.",
    delay: "A seconda della tua banca, l'importo appare sul conto entro pochi giorni.",
    amountLabel: "Importo rimborsato",
    footer: "Un dubbio o un errore? Chiama il forno.",
  },
};
