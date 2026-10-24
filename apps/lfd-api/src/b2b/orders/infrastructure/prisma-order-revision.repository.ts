import { Injectable } from "@nestjs/common";

import { OrderStatus, Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../domain/entities/order-revision.js";
import { OrderRevisionRepository } from "../domain/ports/order-revision.repository.js";
import { toFulfillmentJson } from "./order-json.js";
import { orderLineDataOf } from "./order-line.data.js";
import { REVISABLE_ORDER_SELECT, toRevisableOrder } from "./revisable-order.row.js";
import { revisedCompositionOf } from "./revised-composition.js";

/**
 * Adaptateur Prisma de la révision d'une commande (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, §9). Rejoint
 * l'unité de travail ambiante : la révision, son historique, la note au
 * fournil, la ligne d'encaissement et les faits partent ensemble, ou rien.
 */
@Injectable()
export class PrismaOrderRevisionRepository extends OrderRevisionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<RevisableOrder | null> {
    // Le verrou d'abord, la lecture ensuite : sous `FOR UPDATE`, une seconde
    // modification attend la première, puis lit sa révision.
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ${orderId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: REVISABLE_ORDER_SELECT,
    });
    return toRevisableOrder(row);
  }

  /**
   * L'écriture conditionnée d'abord (révision ET `placed`, R7) : si elle ne
   * franchit pas, rien d'autre n'est écrit. La composition remplacée est
   * relue telle qu'écrite AVANT d'être recouverte, puis les lignes sont
   * remplacées en bloc — l'historique seul fait foi du passé.
   */
  async save(revision: OrderRevisionToSave, author: RevisionActor, at: Date): Promise<boolean> {
    const replaced = await revisedCompositionOf(this.prisma, revision.orderId);
    const { state } = revision;
    const { count } = await this.prisma.order.updateMany({
      where: { id: revision.orderId, revision: revision.fromRevision, status: OrderStatus.placed },
      data: {
        revision: revision.toRevision,
        revisedAt: at,
        requestedDeliveryDate: state.requestedDeliveryDate,
        fulfillmentMethod: state.fulfillmentMethod,
        deliveryZoneId: state.deliveryZoneId,
        deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
        deliveryAddressId: state.deliveryAddressId,
        pickupAddress: state.pickupAddress ?? Prisma.DbNull,
        fulfillment: toFulfillmentJson(state.agreed),
        note: state.note,
        subtotalCents: state.subtotalCents,
        discountCents: state.discountCents,
        discountAdjustment: state.discountAdjustment ?? Prisma.DbNull,
        deliveryFeeCents: state.deliveryFeeCents,
        deliveryFeeAdjustment: state.deliveryFeeAdjustment ?? Prisma.DbNull,
        lateFeeCents: state.lateFeeCents,
        lateFeeAdjustment: state.lateFeeAdjustment ?? Prisma.DbNull,
        deliveryVatMode: state.deliveryVatMode,
        voucherDiscountCents: state.voucherDiscountCents,
        vatCents: state.vatCents,
        vatShares: state.vatShares.map((share) => ({
          rate: share.rate,
          amountCents: share.amountCents,
        })),
        totalCents: state.totalCents,
      },
    });
    if (count === 0) {
      return false;
    }
    await this.prisma.orderRevisionEntry.create({
      data: {
        orderId: revision.orderId,
        replacedRevision: revision.fromRevision,
        composition: replaced,
        changes: [...revision.changes],
        totalBeforeCents: revision.totalBeforeCents,
        totalAfterCents: revision.totalAfterCents,
        revisedByKind: author.kind,
        revisedByUserId: author.kind === "customer" ? author.userId : null,
        revisedByStaffId: author.kind === "staff" ? author.staffId : null,
        revisedAt: at,
      },
    });
    await this.prisma.order.update({
      where: { id: revision.orderId },
      data: { lines: { deleteMany: {}, create: state.lines.map(orderLineDataOf) } },
    });
    return true;
  }
}
