import type { BillingMailsCopy } from "../model/billing-mails.model.js";

/** La famille « facturation et prélèvement », en italien. Traduction du français, pas une variante. */
export const BILLING_MAILS_IT: BillingMailsCopy = {
  "customer.invoice-issued": {
    title: "La sua fattura {number}",
    subject: "{title} — {seller}",
    greeting: "Buongiorno,",
    intro:
      "{seller} ha emesso la fattura {number} intestata a {buyer}{period}, per un importo di {total} IVA inclusa.",
    periodClause: " per gli ordini {period}",
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
  "customer.collection-notice": {
    title: {
      notice: "Avviso di addebito diretto",
      correction: "Avviso di addebito diretto rettificato",
      cancellation: "Addebito diretto annullato",
    },
    subject: "{title} — {creditor} · {day}",
    greeting: "Buongiorno,",
    cancelled:
      "L'addebito di {amount} che le avevamo annunciato per {day} sul conto di " +
      "{debtor} non avrà luogo. Nessuna somma sarà addebitata in quella data.",
    correctionLead: "Questo avviso sostituisce il precedente.",
    representationLead: "Si tratta di una nuova presentazione dell'addebito respinto del {day}.",
    announced: "{creditor} addebiterà {amount} sul conto di {debtor} il {day}, a titolo {pieces}.",
    piecesStatement: "dell'estratto di fatturazione {statement}",
    piecesOneInvoice: "della fattura {number}",
    piecesInvoices: "delle fatture {numbers}",
    creditorLabel: "Creditore",
    creditorIdentifierLabel: "Identificativo del creditore (ICS)",
    mandateReferenceLabel: "Riferimento del mandato (RUM)",
    cancelledAmountLabel: "Importo annullato",
    announcedDayLabel: "Data annunciata",
    previousLabel: "Annunciato in precedenza",
    previousValue: "{amount} il {day}",
    collectionDayLabel: "Data dell'addebito",
    representationLabel: "Nuova presentazione del rifiuto del",
    statementLabel: "Estratto di fatturazione",
    invoiceLabel: "Fattura",
    invoicesLabel: "Fatture",
    amountLabel: "Importo",
    footer:
      "Questo addebito diretto SEPA è effettuato in virtù del mandato indicato sopra. " +
      "Per qualsiasi domanda, risponda a questo messaggio prima della data dell'addebito.",
  },
  "customer.mandate-to-sign": {
    scheme: {
      CORE: {
        documentName: "mandato di addebito diretto SEPA",
        footer:
          "Questo mandato rientra nello schema SEPA CORE. Ha diritto al rimborso da parte della " +
          "sua banca alle condizioni previste dal contratto stipulato con essa: la richiesta di " +
          "rimborso deve essere presentata entro 8 settimane dalla data di addebito sul suo " +
          "conto per un addebito autorizzato.",
      },
      B2B: {
        documentName: "mandato di addebito diretto SEPA B2B",
        footer:
          "Importante: questo mandato rientra nello schema SEPA B2B (tra imprese). È destinato " +
          "esclusivamente a transazioni tra imprese e non dà diritto ad alcun rimborso una volta " +
          "addebitato il suo conto. Prima del primo addebito, lo dichiari alla sua banca con il " +
          "riferimento del mandato e l'identificativo del creditore indicati sopra — senza questa " +
          "dichiarazione, la sua banca rifiuterà l'addebito.",
      },
    },
    subject: "Il suo {document} — {ref}",
    title: "Il suo {document} da firmare",
    greeting: "Buongiorno,",
    intro:
      "Trova in allegato il {document} predisposto per {company}. È precompilato: " +
      "le resta solo da datarlo, firmarlo e rinviarcelo scansionato o fotografato.",
    mandateReferenceLabel: "Riferimento del mandato (RUM)",
    creditorIdentifierLabel: "Identificativo del creditore (ICS)",
    creditorLabel: "Creditore",
  },
};
