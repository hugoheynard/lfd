import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderReviews, type OrderReviewRecord } from "../domain/entities/order-reviews.js";

/** Les colonnes de la commande que le visa lit. */
const REVIEWED_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  placedByUserId: true,
  companyId: true,
  placedByStaffId: true,
  clientele: true,
  status: true,
  createdAt: true,
  revision: true,
  reviews: true,
} as const;

/** Une ligne `order_reviews`, vue d'ici seulement. */
interface OrderReviewRow {
  readonly id: string;
  readonly reviewedRevision: number;
  readonly reviewedByStaffId: string;
  readonly reviewedAt: Date;
  readonly note: string | null;
  readonly withdrawnByStaffId: string | null;
  readonly withdrawnAt: Date | null;
}

/**
 * Le registre des visas d'une commande, relu en une requête (la commande et
 * ses visas). Partagé par l'écriture et la lecture du détail : les deux
 * voient le même agrégat, donc la même règle.
 */
export async function loadOrderReviews(
  prisma: PrismaService,
  orderId: string,
): Promise<OrderReviews | null> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: REVIEWED_ORDER_SELECT,
  });
  if (row === null) {
    return null;
  }
  return OrderReviews.of(
    {
      orderId: row.id,
      orderNumber: row.orderNumber,
      placedByUserId: row.placedByUserId,
      companyId: row.companyId,
      placedByStaffId: row.placedByStaffId,
      clientele: row.clientele,
      status: row.status,
      placedAt: row.createdAt,
      revision: row.revision,
    },
    row.reviews.map(recordOf),
  );
}

/** Une ligne → un visa ; les deux colonnes de retrait vont ensemble (CHECK). */
export function recordOf(row: OrderReviewRow): OrderReviewRecord {
  return {
    id: row.id,
    reviewedRevision: row.reviewedRevision,
    reviewedByStaffId: row.reviewedByStaffId,
    reviewedAt: row.reviewedAt,
    note: row.note,
    withdrawn:
      row.withdrawnAt === null || row.withdrawnByStaffId === null
        ? null
        : { at: row.withdrawnAt, byStaffId: row.withdrawnByStaffId },
  };
}
