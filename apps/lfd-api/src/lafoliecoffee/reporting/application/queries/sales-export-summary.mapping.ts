import { instantToLocal } from "@lfd/contracts";

import { goodsCents } from "../../../growth/domain/revenue-scope.js";
import type { IssuedCreditNote } from "../../../accounting/domain/ports/issued-credit-notes.reader.js";
import type { SalesExportOrder } from "../../../orders/domain/ports/sales-export.reader.js";
import { eurosOfCents } from "../../domain/services/euros.js";
import { returnRefundedCents } from "../../domain/services/return-refunds.js";
import {
  summarizeSales,
  type DaySummary,
  type RevenueTally,
  type SummaryOrderFacts,
} from "../../domain/services/sales-summary.js";
import { rateVatOf } from "./sales-export-orders.mapping.js";
import type { SalesExportLookups } from "./sales-export.lookups.js";
import type { RevenueTallyView, SalesExportDayView } from "./sales-export.view.js";

/**
 * **Le résumé servi** : calculé en centimes sur les mêmes commandes que le
 * tableau `orders` — le jour de passation lu à Paris, comme la période —,
 * puis converti en euros.
 */
export function summaryViewOf(
  days: readonly string[],
  orders: readonly SalesExportOrder[],
  creditNotes: readonly IssuedCreditNote[],
  lookups: SalesExportLookups,
): readonly SalesExportDayView[] {
  const facts = orders.map((order) => summaryFactsOf(order, lookups));
  const notes = creditNotes.map((note) => ({
    issuedOn: note.issuedOn,
    htCents: note.totalHtCents,
    vatCents: note.totalVatCents,
    ttcCents: note.totalTtcCents,
  }));
  return summarizeSales(days, facts, notes).map(dayViewOf);
}

function summaryFactsOf(order: SalesExportOrder, lookups: SalesExportLookups): SummaryOrderFacts {
  return {
    day: instantToLocal(order.placedAt).day,
    clientele: order.clientele,
    countsAsRevenue: order.countsAsRevenue,
    totalCents: order.amounts.totalCents,
    vatCents: order.amounts.vatCents,
    goodsCents: goodsCents(order.amounts),
    vatByRate: rateVatOf(order),
    returnRefundedCents: returnRefundedCents(
      order.countsAsRevenue,
      lookups.refundsByOrder.get(order.orderId) ?? [],
    ),
  };
}

function dayViewOf(day: DaySummary): SalesExportDayView {
  return {
    day: day.day,
    ...tallyViewOf(day),
    byClientele: {
      pro: tallyViewOf(day.byClientele.pro),
      public: tallyViewOf(day.byClientele.public),
      unknown: tallyViewOf(day.byClientele.unknown),
    },
    creditNotesHt: eurosOfCents(day.creditNotesHtCents),
    creditNotesVat: eurosOfCents(day.creditNotesVatCents),
    creditNotesTtc: eurosOfCents(day.creditNotesTtcCents),
  };
}

function tallyViewOf(tally: RevenueTally): RevenueTallyView {
  return {
    orders: tally.orders,
    revenueHt: eurosOfCents(tally.revenueHtCents),
    goodsHt: eurosOfCents(tally.goodsHtCents),
    vat: eurosOfCents(tally.vatCents),
    revenueTtc: eurosOfCents(tally.revenueTtcCents),
    vatByRate:
      tally.vatByRate === null
        ? null
        : tally.vatByRate.map((share) => ({ rate: share.rate, vat: eurosOfCents(share.vatCents) })),
    returnRefundedTtc: eurosOfCents(tally.returnRefundedCents),
    netRevenueTtc: eurosOfCents(tally.netRevenueTtcCents),
  };
}
