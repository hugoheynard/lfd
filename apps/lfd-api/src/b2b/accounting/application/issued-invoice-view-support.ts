import type {
  IssuedInvoiceSummaryView,
  IssuedInvoiceView,
  IssuedInvoicesView,
  OrderInvoicesView,
} from "@lfd/contracts";
import type { InvoiceVatPart } from "@lfd/money";

import type { Invoice } from "../domain/entities/invoice.js";
import { mandateReferenceOf } from "../domain/entities/invoice.types.js";
import { InvoiceNotFoundError } from "../domain/errors/invoice-access-errors.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { InvoiceReader } from "../domain/ports/invoice.reader.js";
import type { OrderInvoicesReader } from "../domain/ports/order-invoices.reader.js";

/** Les deux ports qu'une lecture de facture appelle. */
export interface IssuedInvoiceReaders {
  readonly invoices: InvoiceReader;
  readonly periods: InvoicePeriodsReader;
}

/**
 * **Les factures d'un payeur légal**, les plus récentes d'abord — numéro
 * décroissant, l'ordre chronologique de la séquence (E2). Le mur est
 * `payer_company_id` — la fiche staff d'une société ; « Mes factures » d'un
 * client passe par `invoicesViewOf`, qui voit aussi les pièces de ses bons.
 */
export async function issuedInvoicesOf(
  readers: IssuedInvoiceReaders,
  payerCompanyId: string,
): Promise<IssuedInvoicesView> {
  return invoicesViewOf(readers.periods, await readers.invoices.byPayer(payerCompanyId));
}

/**
 * Des pièces déjà lues, les plus récentes d'abord, avec leur mois facturé —
 * « Mes factures » les lit par `CompanyInvoicesReader` (E6 (a)).
 */
export async function invoicesViewOf(
  periodsReader: InvoicePeriodsReader,
  read: readonly Invoice[],
): Promise<IssuedInvoicesView> {
  const invoices = [...read].reverse();
  const periods = await periodsReader.periodsOf(invoices.map((invoice) => invoice.id));
  return {
    invoices: invoices.map((invoice) => summaryOf(invoice, periods.get(invoice.id) ?? null)),
  };
}

/** Une pièce déjà lue (et déjà passée au mur), avec son mois facturé. */
export async function invoiceViewOf(
  periodsReader: InvoicePeriodsReader,
  invoice: Invoice,
): Promise<IssuedInvoiceView> {
  const period = (await periodsReader.periodsOf([invoice.id])).get(invoice.id) ?? null;
  return detailOf(invoice, period);
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

/**
 * **La facture et les avoirs d'une commande** (lot E5c), dans l'ordre des
 * numéros — pour la fiche commande du back-office.
 */
export async function orderInvoicesOf(
  readers: { readonly invoices: OrderInvoicesReader; readonly periods: InvoicePeriodsReader },
  orderId: string,
): Promise<OrderInvoicesView> {
  const invoices = await readers.invoices.ofOrder(orderId);
  const periods = await readers.periods.periodsOf(invoices.map((invoice) => invoice.id));
  return {
    invoices: invoices.map((invoice) => summaryOf(invoice, periods.get(invoice.id) ?? null)),
  };
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
    mandateReference: mandateReferenceOf(state.paymentMeans),
    paidOn: state.prepayment?.paidOn ?? null,
  };
}
