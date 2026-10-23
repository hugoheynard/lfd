import type { BillingMailsCopy } from "../model/billing-mails.model.js";

/** La famille « facturation et prélèvement », en anglais. Traduction du français, pas une variante. */
export const BILLING_MAILS_EN: BillingMailsCopy = {
  "customer.invoice-issued": {
    title: "Your invoice {number}",
    subject: "{title} — {seller}",
    greeting: "Hello,",
    intro:
      "{seller} has issued invoice {number} addressed to {buyer}{period}, for {total} including VAT.",
    periodClause: " for the orders {period}",
    attachedNote:
      "It is attached to this message as a Factur-X PDF: your accounting software can read its data.",
    invoiceLabel: "Invoice",
    dateLabel: "Date",
    periodLabel: "Period",
    addressedToLabel: "Addressed to",
    dueLabel: "Due date",
    paymentLabel: "Payment",
    totalLabel: "Total incl. VAT",
    cta: "See my invoices",
    footer:
      "This invoice is available at any time in your customer area, under “My invoices”. For any question, reply to this message.",
  },
  "customer.collection-notice": {
    title: {
      notice: "Direct debit notice",
      correction: "Corrected direct debit notice",
      cancellation: "Direct debit cancelled",
    },
    subject: "{title} — {creditor} · {day}",
    greeting: "Hello,",
    cancelled:
      "The direct debit of {amount} that we announced for {day} on the account of " +
      "{debtor} will not take place. No amount will be debited on that date.",
    correctionLead: "This notice replaces the previous one.",
    representationLead: "This is a new presentation of the direct debit rejected on {day}.",
    announced:
      "{creditor} will debit {amount} from the account of {debtor} on {day}, in payment of {pieces}.",
    piecesStatement: "billing statement {statement}",
    piecesOneInvoice: "invoice {number}",
    piecesInvoices: "invoices {numbers}",
    creditorLabel: "Creditor",
    creditorIdentifierLabel: "Creditor identifier (ICS)",
    mandateReferenceLabel: "Mandate reference (UMR)",
    cancelledAmountLabel: "Cancelled amount",
    announcedDayLabel: "Announced date",
    previousLabel: "Previously announced",
    previousValue: "{amount} on {day}",
    collectionDayLabel: "Debit date",
    representationLabel: "New presentation of the rejection of",
    statementLabel: "Billing statement",
    invoiceLabel: "Invoice",
    invoicesLabel: "Invoices",
    amountLabel: "Amount",
    footer:
      "This SEPA direct debit is made under the mandate referenced above. " +
      "For any question, reply to this message before the debit date.",
  },
  "customer.mandate-to-sign": {
    scheme: {
      CORE: {
        documentName: "SEPA direct debit mandate",
        footer:
          "This mandate falls under the SEPA CORE scheme. You are entitled to a refund from " +
          "your bank under the terms and conditions of your agreement with it: a refund must be " +
          "claimed within 8 weeks starting from the date on which your account was debited for " +
          "an authorised debit.",
      },
      B2B: {
        documentName: "SEPA business-to-business direct debit mandate",
        footer:
          "Important: this mandate falls under the SEPA business-to-business (B2B) scheme. It " +
          "is intended solely for business-to-business transactions and gives no right to a " +
          "refund once your account has been debited. Before the first debit, register it " +
          "with your bank using the mandate reference and the creditor identifier above — " +
          "without this registration, your bank will refuse the debit.",
      },
    },
    subject: "Your {document} — {ref}",
    title: "Your {document} to sign",
    greeting: "Hello,",
    intro:
      "Please find attached the {document} drawn up for {company}. It is pre-filled: " +
      "all you need to do is date it, sign it, and send it back to us scanned or photographed.",
    mandateReferenceLabel: "Mandate reference (UMR)",
    creditorIdentifierLabel: "Creditor identifier (ICS)",
    creditorLabel: "Creditor",
  },
};
