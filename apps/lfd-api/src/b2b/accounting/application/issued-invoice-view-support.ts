import type {
  IssuedInvoiceSummaryView,
  IssuedInvoiceView,
  IssuedInvoicesView,
} from "@lfd/contracts";
import type { InvoiceVatPart } from "@lfd/money";

import type { Invoice } from "../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../domain/errors/invoice-access-errors.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { InvoiceReader } from "../domain/ports/invoice.reader.js";

/** Les deux ports qu'une lecture de facture appelle. */
export interface IssuedInvoiceReaders {
  readonly invoices: InvoiceReader;
  readonly periods: InvoicePeriodsReader;
}

/**
 * **Les factures d'un payeur légal**, les plus récentes d'abord — numéro
 * décroissant, l'ordre chronologique de la séquence (E2). Le mur est
 * `payer_company_id` : un sous-compte ne voit pas celles de son principal
 * (E6, question ouverte au plan).
 */
export async function issuedInvoicesOf(
  readers: IssuedInvoiceReaders,
  payerCompanyId: string,
): Promise<IssuedInvoicesView> {
  const invoices = [...(await readers.invoices.byPayer(payerCompanyId))].reverse();
  const periods = await readers.periods.periodsOf(invoices.map((invoice) => invoice.id));
  return {
    invoices: invoices.map((invoice) => summaryOf(invoice, periods.get(invoice.id) ?? null)),
  };
}

/**
 * Une pièce, et son mois facturé. `payerCompanyId` donné : refusée (404)
 * quand elle n'est pas adressée à cette société.
 *
 * @throws {InvoiceNotFoundError}
 */
export async function issuedInvoiceOf(
  readers: IssuedInvoiceReaders,
  invoiceId: string,
  payerCompanyId: string | null,
): Promise<IssuedInvoiceView> {
  const invoice = await readers.invoices.byId(invoiceId);
  if (
    invoice === null ||
    (payerCompanyId !== null && invoice.toState().buyer.companyId !== payerCompanyId)
  ) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  const period = (await readers.periods.periodsOf([invoice.id])).get(invoice.id) ?? null;
  return detailOf(invoice, period);
}

function summaryOf(invoice: Invoice, period: string | null): IssuedInvoiceSummaryView {
  const state = invoice.toState();
  return {
    invoiceId: state.id,
    number: state.number,
    kind: invoice.isCreditNote ? "credit_note" : "invoice",
    correctedInvoiceNumber: state.correctedInvoiceNumber,
    issuedOn: state.issuedOn,
    dueOn: state.dueOn,
    period,
    totalHtCents: state.vat.taxableBaseCents,
    totalVatCents: state.vat.vatCents,
    totalTtcCents: state.vat.totalCents,
    documentAvailable: state.documentKey !== null,
  };
}

const sum = (parts: readonly InvoiceVatPart[]): number =>
  parts.reduce((total, part) => total + part.amountCents, 0);

/** Le vendeur sans son IBAN ni son BIC : une facture se lit, elle ne fait pas virer. */
function detailOf(invoice: Invoice, period: string | null): IssuedInvoiceView {
  const state = invoice.toState();
  const { seller, buyer, vat, mentions } = state;
  return {
    ...summaryOf(invoice, period),
    payerCompanyId: buyer.companyId,
    seller: {
      name: seller.name,
      legalForm: seller.legalForm,
      siren: seller.siren,
      vatNumber: seller.vatNumber,
      rcs: seller.rcs,
      shareCapitalCents: seller.shareCapitalCents,
      addressLines: seller.addressLines,
    },
    buyer: {
      name: buyer.name,
      legalForm: buyer.legalForm,
      siren: buyer.siren,
      vatNumber: buyer.vatNumber,
      billingAddressLines: buyer.billingAddressLines,
    },
    orders: state.orders.map((order) => ({
      reference: order.reference,
      deliveredOn: order.deliveredOn,
    })),
    lines: state.lines.map((line) => ({ ...line })),
    vat: {
      categories: vat.categories.map((category) => ({
        rate: category.rate,
        goodsHtCents: category.goodsHtCents,
        allowancesCents: sum(category.allowances),
        chargesCents: sum(category.charges),
        taxableBaseCents: category.taxableBaseCents,
        vatCents: category.vatCents,
      })),
      goodsHtCents: vat.goodsHtCents,
      allowancesCents: vat.allowancesCents,
      chargesCents: vat.chargesCents,
    },
    mentions: {
      latePenaltyRateBasisPoints: mentions.latePenaltyRateBasisPoints,
      recoveryIndemnityCents: mentions.recoveryIndemnityCents,
      earlyPaymentDiscount: mentions.earlyPaymentDiscount,
    },
    mandateReference: state.paymentMeans?.mandateReference ?? null,
  };
}
