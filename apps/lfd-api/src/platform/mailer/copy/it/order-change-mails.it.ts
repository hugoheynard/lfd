import type { OrderChangeMailsCopy } from "../model/order-change-mails.model.js";

/** La famiglia « richiesta di modifica », in italiano. */
export const ORDER_CHANGE_MAILS_IT: OrderChangeMailsCopy = {
  "customer.order-change-applied": {
    kicker: "Ordine modificato",
    subject: "Ordine {ref} modificato su tua richiesta",
    title: "La tua modifica è fatta.",
    intro: "Abbiamo modificato il tuo ordine {ref} come ci hai chiesto.",
    where: "L'ordine aggiornato si legge nel tuo spazio, alla voce I miei ordini.",
    footer:
      "Un dubbio o un errore? Chiama il laboratorio — Le Labo · route de la Balme, Val d'Isère.",
  },
  "customer.order-change-refused": {
    kicker: "Richiesta di modifica",
    subject: "Ordine {ref}: modifica impossibile",
    title: "Non abbiamo potuto modificare il tuo ordine.",
    intro: "Ci hai chiesto di modificare il tuo ordine {ref}: non è possibile.",
    reasonLabel: "Una parola dal nostro team",
    unchanged: "Il tuo ordine resta come l'avevi effettuato.",
    footer:
      "Un dubbio o un errore? Chiama il laboratorio — Le Labo · route de la Balme, Val d'Isère.",
  },
};
