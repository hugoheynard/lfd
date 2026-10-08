import type { InvoiceVatCategory, InvoiceVatPart } from "@lfd/money";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { StatementBuyer, StatementSeller } from "../domain/entities/billing-statement.js";
import type { Invoice, InvoiceLine } from "../domain/services/invoice-dossier.types.js";

/*
 * Les formes JSON de l'arrêté de facturation, **écrites champ à champ**.
 *
 * Prisma refuse une interface `readonly` comme valeur JSON, et un cast l'aurait
 * fait taire sans rien garantir (même raison que `orders/infrastructure/order-json.ts`).
 * Recopier ici rend visible ce qui part en base : une propriété ajoutée au
 * domaine n'entre pas dans une pièce figée sans qu'on l'ait décidé — et
 * `body_version` doit alors bouger avec elle.
 */

export function sellerJson(seller: StatementSeller): Prisma.InputJsonValue {
  return {
    legalEntityId: seller.legalEntityId,
    name: seller.name,
    legalForm: seller.legalForm,
    siren: seller.siren,
    vatNumber: seller.vatNumber,
    rcs: seller.rcs,
    shareCapitalCents: seller.shareCapitalCents,
    addressLines: [...seller.addressLines],
    ics: seller.ics,
    creditorIban: seller.creditorIban,
    creditorBic: seller.creditorBic,
  };
}

export function buyerJson(buyer: StatementBuyer): Prisma.InputJsonValue {
  return {
    companyId: buyer.companyId,
    name: buyer.name,
    legalForm: buyer.legalForm,
    siret: buyer.siret,
    siren: buyer.siren,
    vatNumber: buyer.vatNumber,
    billingAddressLines: [...buyer.billingAddressLines],
  };
}

/** `body_version` 1 : la facture de `simulateInvoiceDossier`, telle quelle. */
export function bodyJson(invoice: Invoice): Prisma.InputJsonValue {
  return {
    lines: invoice.lines.map(lineJson),
    companyDiscountCents: invoice.companyDiscountCents,
    voucherDiscountCents: invoice.voucherDiscountCents,
    lateFeeCents: invoice.lateFeeCents,
    deliveries: invoice.deliveries.map((line) => ({
      mode: line.mode,
      amountCents: line.amountCents,
    })),
    vat: {
      categories: invoice.vat.categories.map(categoryJson),
      goodsHtCents: invoice.vat.goodsHtCents,
      allowancesCents: invoice.vat.allowancesCents,
      chargesCents: invoice.vat.chargesCents,
      taxableBaseCents: invoice.vat.taxableBaseCents,
      vatCents: invoice.vat.vatCents,
      totalCents: invoice.vat.totalCents,
    },
    totalCents: invoice.totalCents,
  };
}

/** Quantité, prix net unitaire (millicentimes), montant, taux, période de livraison. */
function lineJson(line: InvoiceLine): Prisma.InputJsonValue {
  return {
    sku: line.sku,
    label: line.label,
    otherLabels: [...line.otherLabels],
    quantity: line.quantity,
    unitPriceMillicents: line.unitPriceMillicents,
    amountCents: line.amountCents,
    vatRate: line.vatRate,
    ordersLineTotalCents: line.ordersLineTotalCents,
    firstDeliveryDate: line.firstDeliveryDate,
    lastDeliveryDate: line.lastDeliveryDate,
  };
}

function categoryJson(category: InvoiceVatCategory): Prisma.InputJsonValue {
  return {
    rate: category.rate,
    goodsHtCents: category.goodsHtCents,
    allowances: category.allowances.map(partJson),
    charges: category.charges.map(partJson),
    taxableBaseCents: category.taxableBaseCents,
    vatCents: category.vatCents,
  };
}

function partJson(part: InvoiceVatPart): Prisma.InputJsonValue {
  return { key: part.key, amountCents: part.amountCents };
}
