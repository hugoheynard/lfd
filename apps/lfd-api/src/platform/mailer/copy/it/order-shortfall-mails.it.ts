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
    remainderAbandoned: "Il resto non sarà consegnato, e non ti sarà fatturato.",
    closing: "Ci scusiamo per gli articoli mancanti.",
    footer: "Un dubbio o un errore? Chiama il forno — Le Labo · route de la Balme, Val d'Isère.",
  },
};
