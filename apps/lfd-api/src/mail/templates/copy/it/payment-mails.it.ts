import type { PaymentMailsCopy } from "../model/payment-mails.model.js";

/** La famille « paiement et annulation », en italien. Traduction du français, pas une variante. */
export const PAYMENT_MAILS_IT: PaymentMailsCopy = {
  "customer.payment-failed": {
    subject: "Pagamento rifiutato — il suo ordine {ref}",
    kicker: "Pagamento rifiutato",
    title: "Il suo pagamento non è andato a buon fine.",
    intro: "La sua banca ha rifiutato il pagamento di questo ordine.",
    consequence:
      "Il suo ordine non entra quindi in produzione e nulla la attende al banco. " +
      "Riprenda il pagamento qui sotto per rilanciarlo.",
    amountLabel: "Importo da saldare",
    cta: "Riprendere il pagamento",
    footer: "Un dubbio o un errore? Ci chiami.",
  },
  "customer.payment-expired": {
    subject: "Ordine {ref} annullato — pagamento non riuscito",
    kicker: "Ordine annullato",
    title: "Il suo pagamento non è riuscito in tempo.",
    intro: "Il pagamento di questo ordine non è riuscito prima della preparazione dell'infornata.",
    consequence:
      "Il suo ordine è quindi annullato e nulla è stato addebitato. " +
      "Se ne ha ancora bisogno, effettui un nuovo ordine.",
    amountLabel: "Importo non addebitato",
    footer: "Un dubbio o un errore? Ci chiami.",
  },
  "customer.order-payment-link": {
    kicker: "Pagamento in attesa",
    subject: "Il suo ordine {ref} è ancora da saldare",
    title: "Il suo ordine attende il pagamento",
    intro: "Il pagamento del suo ordine {ref} non ci è ancora pervenuto.",
    howToPay: "Può saldarlo con carta dalla sua area personale, seguendo il link qui sotto.",
    amountLabel: "Importo da saldare",
    cta: "Saldare il mio ordine",
    footer:
      "Già pagato? I due messaggi si sono incrociati: ignori questo. " +
      "Un dubbio? Risponda a questa e-mail.",
  },
  "customer.order-cancelled": {
    kicker: "Ordine annullato",
    subject: "Ordine {ref} annullato",
    title: "Il suo ordine è stato annullato.",
    intro: "Il suo ordine {ref} per {day} è stato annullato dal nostro team.",
    introWithoutDay: "Il suo ordine {ref} è stato annullato dal nostro team.",
    introBySelf: "Ha annullato il suo ordine {ref} per {day}.",
    introBySelfWithoutDay: "Ha annullato il suo ordine {ref}.",
    introByMember: "{name} ha annullato l'ordine {ref} di {company} per {day}.",
    introByMemberWithoutDay: "{name} ha annullato l'ordine {ref} di {company}.",
    introByPrincipal:
      "L'ordine {ref} per {day} è stato annullato da {name}, dell'account principale {principal}.",
    introByPrincipalWithoutDay:
      "L'ordine {ref} è stato annullato da {name}, dell'account principale {principal}.",
    nothingBilled: "Non le verrà addebitato nulla per questo ordine.",
    nothingCharged: "Nessun pagamento è stato prelevato.",
    nothingInvoiced: "Per questo ordine non verrà fatturato né addebitato nulla.",
    refundToCard:
      "L'importo di {amount} pagato con carta e non ancora rimborsato vi sarà rimborsato sulla stessa carta. A seconda della banca, compare entro 5-10 giorni lavorativi.",
    alreadyRefunded: "Il pagamento di questo ordine vi è già stato rimborsato.",
    voucherReturned:
      "Il suo buono fedeltà di {value} le è stato restituito: potrà usarlo per un prossimo ordine fino al {day}.",
    voucherMerged:
      "Il suo buono fedeltà ritrova il suo valore di {value}, valido fino al {day}. Il buono di {remainder} che le era stato dato come residuo è sostituito da questo.",
    footer: "Un dubbio o un errore? Ci chiami.",
  },
};
