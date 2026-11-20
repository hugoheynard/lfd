import type { AdminOrderNoShow } from "@lfd/contracts";

import type { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { OrderNoShowTraces } from "../../domain/ports/order-no-show.reader.js";

/** Les fiches staff que la fiche d'une commande non retirée nomme. */
export function noShowAuthorsOf(traces: OrderNoShowTraces | null): readonly string[] {
  if (traces === null) {
    return [];
  }
  const notice = traces.noticeRequested;
  return [traces.declared.byStaffId, ...(notice === null ? [] : [notice.byStaffId])];
}

/** La commande non retirée, dans la forme du contrat — l'e-mail se dit « demandé ». */
export function noShowViewOf(
  traces: OrderNoShowTraces | null,
  staff: StaffAuthors,
): AdminOrderNoShow | null {
  if (traces === null) {
    return null;
  }
  const notice = traces.noticeRequested;
  return {
    declaredAt: traces.declared.at.toISOString(),
    declaredByName: staff.nameOf(traces.declared.byStaffId),
    noticeRequest:
      notice === null
        ? null
        : {
            requestedAt: notice.at.toISOString(),
            requestedByName: staff.nameOf(notice.byStaffId),
          },
  };
}
