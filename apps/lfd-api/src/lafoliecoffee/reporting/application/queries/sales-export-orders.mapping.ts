import type { BillableAmounts } from "../../../orders/domain/entities/billable-amounts.js";
import type {
  SalesExportLine,
  SalesExportOrder,
} from "../../../orders/domain/ports/sales-export.reader.js";
import { goodsCents } from "../../../growth/domain/revenue-scope.js";
import type { IssuedCreditNote } from "../../../accounting/domain/ports/issued-credit-notes.reader.js";
import {
  eurosOfCents,
  eurosOfMillicents,
  eurosOfNullableCents,
} from "../../domain/services/euros.js";
import { parisIso, parisIsoToMinute } from "../../domain/services/paris-iso.js";
import { returnRefundedCents } from "../../domain/services/return-refunds.js";
import type { RateVat } from "../../domain/services/sales-summary.js";
import { namedCompanyOf, type SalesExportLookups } from "./sales-export.lookups.js";
import type {
  RateAmountsView,
  SalesExportCreditNoteView,
  SalesExportLineView,
  SalesExportOrderView,
  SettledAmountsView,
} from "./sales-export.view.js";

/** Une commande servie, et ce que le résumé en lit. */
export function orderViewOf(
  order: SalesExportOrder,
  lookups: SalesExportLookups,
): SalesExportOrderView {
  const refunds = lookups.refundsByOrder.get(order.orderId) ?? [];
  const companyId = namedCompanyOf(order);
  const company = companyId === null ? undefined : lookups.companies.get(companyId);
  return {
    orderNumber: order.orderNumber,
    placedAt: parisIsoToMinute(order.placedAt),
    receivedOn: order.receivedOn,
    status: order.status,
    cancelledAt: order.cancelledAt === null ? null : parisIso(order.cancelledAt),
    countsAsRevenue: order.countsAsRevenue,
    paymentStatus: order.paymentStatus,
    settlementVenue: order.settlementVenue,
    offered: order.offered,
    offerNature: order.offerNature,
    offeredTtc: eurosOfNullableCents(order.offeredTotalCents),
    clientele: order.clientele,
    buyerKind: order.buyerKind,
    companyName: company?.name ?? null,
    nafCode: company?.nafCode ?? null,
    fulfillment: order.fulfillment,
    vatMethod: order.vatMethod,
    ...amountsViewOf(order.amounts),
    goodsHt: eurosOfCents(goodsCents(order.amounts)),
    vatByRate: vatByRateViewOf(order),
    settled:
      order.settlement === null
        ? null
        : settledViewOf(order.settlement.amounts, order.settlement.settledOn),
    refunds: refunds.map((refund) => ({
      refundedAt: parisIso(refund.refundedAt),
      amountTtc: eurosOfCents(refund.amountCents),
      nature: refund.nature,
    })),
    returnRefundedTtc: eurosOfCents(returnRefundedCents(order.countsAsRevenue, refunds)),
  };
}

/**
 * **La TVA par taux d'une commande**, en centimes — la même source que
 * `vatByRate` du tableau `orders`, pour que le résumé additionne ce qui est
 * servi : la base par taux d'une commande `exact_ht`, à défaut `vat_shares`.
 */
export function rateVatOf(order: SalesExportOrder): readonly RateVat[] | null {
  if (order.ttcByRate !== null) {
    return order.ttcByRate.map((part) => ({ rate: part.rate, vatCents: part.vatCents }));
  }
  return order.amounts.vatShares === null
    ? null
    : order.amounts.vatShares.map((share) => ({ rate: share.rate, vatCents: share.amountCents }));
}

function vatByRateViewOf(order: SalesExportOrder): readonly RateAmountsView[] | null {
  if (order.ttcByRate !== null) {
    return order.ttcByRate.map((part) => ({
      rate: part.rate,
      ht: eurosOfCents(part.htCents),
      vat: eurosOfCents(part.vatCents),
      ttc: eurosOfCents(part.ttcCents),
    }));
  }
  return order.amounts.vatShares === null
    ? null
    : order.amounts.vatShares.map((share) => ({
        rate: share.rate,
        ht: null,
        vat: eurosOfCents(share.amountCents),
        ttc: null,
      }));
}

/** Les totaux d'une commande ; `totalCents` est le TTC, le HT en est la TVA retirée. */
function amountsViewOf(amounts: BillableAmounts): Omit<SettledAmountsView, "settledOn"> {
  return {
    subtotalHt: eurosOfCents(amounts.subtotalCents),
    discountHt: eurosOfCents(amounts.discountCents),
    voucherHt: eurosOfCents(amounts.voucherDiscountCents),
    deliveryFeeHt: eurosOfCents(amounts.deliveryFeeCents),
    lateFeeHt: eurosOfCents(amounts.lateFeeCents),
    totalHt: eurosOfCents(amounts.totalCents - amounts.vatCents),
    vat: eurosOfCents(amounts.vatCents),
    totalTtc: eurosOfCents(amounts.totalCents),
  };
}

function settledViewOf(amounts: BillableAmounts, settledOn: string | null): SettledAmountsView {
  return { settledOn, ...amountsViewOf(amounts) };
}

/** Un article : le prix unitaire garde ses cinq décimales (`eurosOfMillicents`). */
export function lineViewOf(
  orderNumber: string,
  line: SalesExportLine,
  familyNames: ReadonlyMap<string, string>,
): SalesExportLineView {
  return {
    orderNumber,
    sku: line.sku,
    article: line.productName,
    familyId: line.categoryId,
    family: line.categoryId === null ? null : (familyNames.get(line.categoryId) ?? null),
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    unitPriceHt: eurosOfMillicents(line.unitPriceMillicents),
    lineHt: eurosOfCents(line.lineTotalCents),
    vatRate: line.vatRate,
    lineTtc: eurosOfNullableCents(line.lineTotalTtcCents),
    discountIds: line.discountIds,
  };
}

/** Un avoir, ses montants lus tels quels, nommé par l'enseigne d'aujourd'hui (§ 10). */
export function creditNoteViewOf(
  note: IssuedCreditNote,
  lookups: SalesExportLookups,
): SalesExportCreditNoteView {
  return {
    number: note.number,
    issuedOn: note.issuedOn,
    companyName: lookups.companies.get(note.payerCompanyId)?.name ?? null,
    ht: eurosOfCents(note.totalHtCents),
    vat: eurosOfCents(note.totalVatCents),
    ttc: eurosOfCents(note.totalTtcCents),
    orderNumbers: note.orderNumbers,
  };
}
