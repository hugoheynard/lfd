import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderNoShow, type NoShowTrace } from "../domain/entities/order-no-show.js";
import {
  OrderNoShowRepository,
  type LockedOrderNoShow,
} from "../domain/ports/order-no-show.repository.js";
import { pickupLabelOf } from "./handover-order.query.js";
import { dayOf } from "./order-money-columns.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";
import { orderLocaleOf } from "./order-locale-column.js";

/** Une trace lue en base : les deux colonnes vont ensemble (CHECK). */
export function noShowTraceOf(at: Date | null, byStaffId: string | null): NoShowTrace | null {
  return at === null || byStaffId === null ? null : { at, byStaffId };
}

/** L'adaptateur de la commande non retirée, sur la ligne de la commande. */
@Injectable()
export class PrismaOrderNoShowRepository extends OrderNoShowRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<LockedOrderNoShow | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        settlementVenue: true,
        handedOverAt: true,
        requestedDeliveryDate: true,
        fulfillment: true,
        pickupAddress: true,
        placedByUserId: true,
        locale: true,
        noShowAt: true,
        noShowByStaffId: true,
        noShowNoticeRequestedAt: true,
        noShowNoticeRequestedByStaffId: true,
      },
    });
    if (row === null) {
      return null;
    }
    return {
      noShow: OrderNoShow.fromSnapshot({
        orderId: row.id,
        reference: row.orderNumber,
        status: row.status,
        settlementVenue: row.settlementVenue,
        handedOver: row.handedOverAt !== null,
        serviceDay: dayOf(row.requestedDeliveryDate),
        windowEnd: windowOf(fulfillmentOf(row.fulfillment))?.end ?? null,
        declared: noShowTraceOf(row.noShowAt, row.noShowByStaffId),
        noticeRequested: noShowTraceOf(
          row.noShowNoticeRequestedAt,
          row.noShowNoticeRequestedByStaffId,
        ),
      }),
      placedByUserId: row.placedByUserId,
      locale: orderLocaleOf(row.locale),
      pickupLabel: pickupLabelOf(row.pickupAddress),
    };
  }

  /**
   * Le statut ne s'écrit que vers `no_show` : l'agrégat ne connaît pas d'autre
   * transition. Le `CHECK orders_no_show_shop_till` refuse en base ce qu'il
   * aurait laissé passer.
   */
  async save(noShow: OrderNoShow): Promise<void> {
    const state = noShow.toSnapshot();
    await this.prisma.order.update({
      where: { id: state.orderId },
      data: {
        ...(state.status === "no_show" ? { status: "no_show" } : {}),
        noShowAt: state.declared?.at ?? null,
        noShowByStaffId: state.declared?.byStaffId ?? null,
        noShowNoticeRequestedAt: state.noticeRequested?.at ?? null,
        noShowNoticeRequestedByStaffId: state.noticeRequested?.byStaffId ?? null,
      },
    });
  }
}
