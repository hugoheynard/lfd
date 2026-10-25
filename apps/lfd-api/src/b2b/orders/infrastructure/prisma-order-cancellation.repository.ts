import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CancellationSubject } from "../domain/ports/cancellation-subject.reader.js";
import type { CancellationAllowance } from "../domain/services/cancellation-allowance.js";
import {
  OrderCancellationRepository,
  type CancellationRecord,
} from "../domain/ports/order-cancellation.repository.js";
import { CANCELLATION_SUBJECT_SELECT, toCancellationSubject } from "./cancellation-subject.row.js";

/** Une carte non encaissée : en attente, ou refusée et encore reprenable. */
const DUE: readonly PaymentStatus[] = [PaymentStatus.pending, PaymentStatus.failed];
/** Une carte encaissée — rendue en entier ou non (lot C4). */
const PAID: readonly PaymentStatus[] = [PaymentStatus.paid, PaymentStatus.refunded];

/**
 * `placed`, et — plan A1, § 1 point 5 — `confirmed` quand l'autorisation va
 * jusqu'au colisage. Jamais `ready` : le `where` le refuse même si un
 * `markReady` passe entre le guichet et l'écriture.
 */
function cancellableStatusesUnder(allowance: CancellationAllowance): OrderStatus[] {
  return allowance.allowance === "before_packing"
    ? [OrderStatus.placed, OrderStatus.confirmed]
    : [OrderStatus.placed];
}

/**
 * L'adaptateur de l'annulation staff. Par le client ROUTÉ : dans l'unité de
 * travail du handler, où le guichet du fournil écrit aussi.
 *
 * Pas de mur tenant ICI : la route staff voit toutes les commandes, et
 * l'annulation par un client (lot C6) applique son mur AVANT d'entrer dans le
 * noyau (`CancelOrderByCustomerHandler`, C6.2), sur la commande lue par son id.
 */
@Injectable()
export class PrismaOrderCancellationRepository extends OrderCancellationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<CancellationSubject | null> {
    // Le verrou d'abord, la lecture ensuite : sous `FOR UPDATE`, un second
    // clic attend le premier, puis lit `cancelled` (C3.4 ter, étape 1).
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ${orderId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: CANCELLATION_SUBJECT_SELECT,
    });
    return toCancellationSubject(row);
  }

  async cancel(
    orderId: string,
    record: CancellationRecord,
    allowance: CancellationAllowance,
  ): Promise<boolean> {
    const status = { in: cancellableStatusesUnder(allowance) };
    const stamp = {
      status: OrderStatus.cancelled,
      cancelledAt: record.cancelledAt,
      cancelledBy: record.cancelledBy,
      cancellationReason: record.reason,
      // Lot C6 : qui a annulé. Le CHECK de la base tient le reste (S4).
      cancelledByKind: record.customer?.kind ?? "staff",
      cancelledByUserId: record.customer?.userId ?? null,
      cancellationReasonCode: record.customer?.reasonCode ?? null,
    };
    // Deux écritures exclusives par leur `where`, comme `markAbandoned` : le
    // règlement d'une carte non payée tombe aussi (`failed`), le total nul
    // garde le sien (`not_required`). `status: placed` dans les deux (plus
    // `confirmed` sous `before_packing`, plan A1) : une commande déjà annulée
    // — par le balayage, par un autre membre de l'équipe — ou prête ne
    // franchit pas.
    const card = await this.prisma.order.updateMany({
      where: { id: orderId, status, paymentStatus: { in: [...DUE] } },
      data: { ...stamp, paymentStatus: PaymentStatus.failed },
    });
    if (card.count === 1) {
      return true;
    }
    const free = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status,
        paymentStatus: PaymentStatus.not_required,
        totalCents: 0,
      },
      data: stamp,
    });
    if (free.count === 1) {
      return true;
    }
    // Lot C5 : au compte. Règlement inchangé (`not_required`), comme le total
    // nul ; disjointe des deux autres par son `where`. La règle comptable
    // (facturée, engagée) est relue sous le verrou par le handler.
    const account = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status,
        paymentStatus: PaymentStatus.not_required,
        totalCents: { gt: 0 },
      },
      data: stamp,
    });
    if (account.count === 1) {
      return true;
    }
    // Lot C4 : payée par carte. Règlement INCHANGÉ — c'est le carnet qui le
    // fera passer `refunded` quand Stripe aura rendu l'argent (C4.6).
    const paid = await this.prisma.order.updateMany({
      where: { id: orderId, status, paymentStatus: { in: [...PAID] } },
      data: stamp,
    });
    return paid.count === 1;
  }
}
