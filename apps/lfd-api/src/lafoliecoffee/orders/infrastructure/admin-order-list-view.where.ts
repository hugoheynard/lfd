import type { AdminOrderListView } from "@lfd/contracts";

import { OrderStatus, type Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { ORDER_REVIEW_STARTS_AT } from "../domain/services/order-review-start.js";
import { abandonedAttemptWhere, notAbandonedAttemptWhere } from "./abandoned-attempt.where.js";

/**
 * La vue de la liste staff, en clause. Une recherche exacte du numéro d'une
 * tentative ne la trouve QUE dans sa vue — les listes « commandes » et
 * « tentatives » sont disjointes.
 *
 * `to_review` (plan du visa des commandes) : passée par un client pro
 * lui-même (abonnements compris), ni brouillon ni annulée — une tentative
 * abandonnée est annulée —, après la mise en service, et sans visa en cours
 * ou révisée depuis. La même règle que l'agrégat `OrderReviews`, écrite en
 * requête.
 */
export async function viewWhere(
  prisma: PrismaService,
  view: AdminOrderListView,
): Promise<Prisma.OrderWhereInput> {
  switch (view) {
    case "abandoned_attempts":
      return abandonedAttemptWhere();
    case "to_review":
      return toReviewWhere(await revisedSinceReviewIds(prisma));
    case "orders":
      return notAbandonedAttemptWhere();
  }
}

function toReviewWhere(revisedSinceReview: readonly string[]): Prisma.OrderWhereInput {
  return {
    placedByStaffId: null,
    clientele: "pro",
    status: { notIn: [OrderStatus.draft, OrderStatus.cancelled] },
    createdAt: { gte: ORDER_REVIEW_STARTS_AT },
    OR: [{ reviews: { none: { withdrawnAt: null } } }, { id: { in: [...revisedSinceReview] } }],
  };
}

/**
 * Les commandes dont le visa en cours a vu une révision plus ancienne que la
 * leur. Prisma ne compare pas une colonne de la relation à une colonne de la
 * commande : une requête à part, bornée par les seuls visas périmés.
 */
async function revisedSinceReviewIds(prisma: PrismaService): Promise<readonly string[]> {
  const rows = await prisma.$queryRaw<{ order_id: string }[]>`
    SELECT r."order_id"
      FROM "public"."order_reviews" r
      JOIN "public"."orders" o ON o."id" = r."order_id"
     WHERE r."withdrawn_at" IS NULL
       AND o."revision" > r."reviewed_revision"`;
  return rows.map((row) => row.order_id);
}
