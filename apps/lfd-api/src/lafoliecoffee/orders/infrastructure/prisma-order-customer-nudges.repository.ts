import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderCustomerNudges,
  type CustomerNudgeTrace,
} from "../domain/entities/order-customer-nudges.js";
import {
  OrderCustomerNudgesRepository,
  type LockedOrderCustomerNudges,
} from "../domain/ports/order-customer-nudges.repository.js";
import { pickupLabelOf } from "./handover-order.query.js";
import { dayOf } from "./order-money-columns.js";
import { fulfillmentOf, windowOf } from "./order-fulfillment.parse.js";
import { orderLocaleOf } from "./order-locale-column.js";

/** Une trace lue en base : les deux colonnes vont ensemble (CHECK). */
function traceOf(at: Date | null, byStaffId: string | null): CustomerNudgeTrace | null {
  return at === null || byStaffId === null ? null : { at, byStaffId };
}

/** L'adaptateur des deux relances d'un retrait en retard, sur la ligne de la commande. */
@Injectable()
export class PrismaOrderCustomerNudgesRepository extends OrderCustomerNudgesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<LockedOrderCustomerNudges | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        fulfillmentMethod: true,
        status: true,
        readyAt: true,
        handedOverAt: true,
        requestedDeliveryDate: true,
        fulfillment: true,
        pickupAddress: true,
        placedByUserId: true,
        locale: true,
        pickupRemindedAt: true,
        pickupRemindedByStaffId: true,
        delayWarnedAt: true,
        delayWarnedByStaffId: true,
      },
    });
    if (row === null) {
      return null;
    }
    return {
      nudges: OrderCustomerNudges.fromSnapshot({
        orderId: row.id,
        reference: row.orderNumber,
        fulfillmentMethod: row.fulfillmentMethod,
        status: row.status,
        readyAt: row.readyAt,
        handedOverAt: row.handedOverAt,
        serviceDay: dayOf(row.requestedDeliveryDate),
        windowEnd: windowOf(fulfillmentOf(row.fulfillment))?.end ?? null,
        pickupReminder: traceOf(row.pickupRemindedAt, row.pickupRemindedByStaffId),
        delayWarning: traceOf(row.delayWarnedAt, row.delayWarnedByStaffId),
      }),
      placedByUserId: row.placedByUserId,
      locale: orderLocaleOf(row.locale),
      pickupLabel: pickupLabelOf(row.pickupAddress),
    };
  }

  async save(nudges: OrderCustomerNudges): Promise<void> {
    const state = nudges.toSnapshot();
    await this.prisma.order.update({
      where: { id: state.orderId },
      data: {
        pickupRemindedAt: state.pickupReminder?.at ?? null,
        pickupRemindedByStaffId: state.pickupReminder?.byStaffId ?? null,
        delayWarnedAt: state.delayWarning?.at ?? null,
        delayWarnedByStaffId: state.delayWarning?.byStaffId ?? null,
      },
    });
  }
}
