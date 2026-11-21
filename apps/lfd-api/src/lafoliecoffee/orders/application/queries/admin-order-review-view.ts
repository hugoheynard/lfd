import type { AdminOrderReviewEntry, AdminOrderReviewState } from "@lfd/contracts";

import type { StaffAuthors } from "../../../../staff/directory/domain/staff-author-directory.js";
import type { OrderReviewRecord, OrderReviews } from "../../domain/entities/order-reviews.js";

/** Les fiches staff que le visa d'une commande nomme : qui a visé, qui a retiré. */
export function reviewAuthorsOf(reviews: OrderReviews | null): readonly string[] {
  if (reviews === null) {
    return [];
  }
  return reviews
    .history()
    .flatMap((record) => [
      record.reviewedByStaffId,
      ...(record.withdrawn === null ? [] : [record.withdrawn.byStaffId]),
    ]);
}

/** Le visa d'une commande, dans la forme du contrat ; `reviewable` dit la règle du geste. */
export function reviewStateOf(reviews: OrderReviews, staff: StaffAuthors): AdminOrderReviewState {
  const current = reviews.current();
  return {
    current: current === null ? null : entryOf(current, staff),
    revisedSinceReview: reviews.revisedSinceReview(),
    reviewable: reviews.reviewable(),
    history: reviews.history().map((record) => entryOf(record, staff)),
  };
}

function entryOf(record: OrderReviewRecord, staff: StaffAuthors): AdminOrderReviewEntry {
  return {
    id: record.id,
    reviewedRevision: record.reviewedRevision,
    reviewedAt: record.reviewedAt.toISOString(),
    reviewedByName: staff.nameOf(record.reviewedByStaffId),
    note: record.note,
    withdrawn:
      record.withdrawn === null
        ? null
        : {
            at: record.withdrawn.at.toISOString(),
            byName: staff.nameOf(record.withdrawn.byStaffId),
          },
  };
}
