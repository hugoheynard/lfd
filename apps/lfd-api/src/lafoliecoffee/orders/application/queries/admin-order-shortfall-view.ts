import type { AdminOrderShortfall, AdminShortfallCustomerNotice } from "@lfd/contracts";

import type { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { OrderShortfallReading } from "../../domain/ports/order-shortfall.reader.js";

/** Les fiches staff que l'encart du manque nomme : qui a décidé, qui a prévenu. */
export function shortfallAuthorsOf(reading: OrderShortfallReading | null): readonly string[] {
  const decision = reading?.decision ?? null;
  if (decision === null) {
    return [];
  }
  const notifier = decision.customerNotice?.byStaffId;
  return [decision.decidedByStaffId, ...(notifier === undefined ? [] : [notifier])];
}

/**
 * Le manque signalé, dans la forme du contrat (E6a) ; le client prévenu,
 * nommé (E6d) ; ce qui part et qui l'a décidé (`documentation/commandes/reliquat/reliquat.md`, § 7).
 */
export function shortfallViewOf(
  reading: OrderShortfallReading,
  staff: StaffAuthors,
): AdminOrderShortfall {
  const decision = reading.decision;
  return {
    reportedAt: reading.reportedAt.toISOString(),
    lines: reading.lines.map((line) => ({
      sku: line.sku,
      due: line.due,
      packed: line.packed,
      saleUnit: line.saleUnit,
    })),
    decision:
      decision === null
        ? null
        : {
            decidedAt: decision.decidedAt.toISOString(),
            remainder: decision.remainder,
            customerNotice: customerNoticeViewOf(decision.customerNotice, staff),
            departing: decision.departing.map((line) => ({
              sku: line.sku,
              quantity: line.quantity,
              saleUnit: line.saleUnit,
            })),
            decidedByName: staff.nameOf(decision.decidedByStaffId),
          },
  };
}

function customerNoticeViewOf(
  notice: { readonly at: Date; readonly byStaffId: string } | null,
  staff: StaffAuthors,
): AdminShortfallCustomerNotice | null {
  return notice === null
    ? null
    : { notifiedAt: notice.at.toISOString(), notifiedByName: staff.nameOf(notice.byStaffId) };
}
