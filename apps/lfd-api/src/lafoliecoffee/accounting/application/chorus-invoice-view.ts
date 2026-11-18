import type { ChorusInvoiceView, ChorusInvoicesView } from "@lfd/contracts";

import { ChorusInvoiceUnreadableError } from "../domain/errors/chorus-deposit-errors.js";
import type { ChorusListedInvoice } from "../domain/ports/chorus-invoices.reader.js";
import { chorusStatusViewOf } from "../domain/services/chorus-status-view.js";

/** Les lignes de la page « Chorus Pro », dans l'ordre que le lecteur a rendu. */
export function chorusInvoicesViewOf(invoices: readonly ChorusListedInvoice[]): ChorusInvoicesView {
  return { invoices: invoices.map(chorusInvoiceViewOf) };
}

function chorusInvoiceViewOf(invoice: ChorusListedInvoice): ChorusInvoiceView {
  const chorus = chorusStatusViewOf(invoice, invoice.standing);
  if (chorus === null) {
    // Le lecteur ne rend que des factures publiques à échéance : inatteignable.
    throw new ChorusInvoiceUnreadableError(invoice.number);
  }
  return {
    invoiceId: invoice.invoiceId,
    number: invoice.number,
    legalEntityId: invoice.legalEntityId,
    legalEntityName: invoice.legalEntityName,
    payerCompanyId: invoice.payerCompanyId,
    payerName: invoice.payerName,
    issuedOn: invoice.issuedOn,
    totalTtcCents: invoice.totalTtcCents,
    budgetCommitmentNumber: invoice.budgetCommitmentNumber,
    budgetCommitmentServiceCode: invoice.budgetCommitmentServiceCode,
    documentAvailable: invoice.documentAvailable,
    chorus,
  };
}
