import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CancellationSubject } from "../domain/ports/cancellation-subject.reader.js";
import {
  OrderCancellationRepository,
  type CancellationRecord,
} from "../domain/ports/order-cancellation.repository.js";
import { CANCELLATION_SUBJECT_SELECT, toCancellationSubject } from "./cancellation-subject.row.js";

/** Une carte non encaissée : en attente, ou refusée et encore reprenable. */
const DUE: readonly PaymentStatus[] = [PaymentStatus.pending, PaymentStatus.failed];

/**
 * L'adaptateur de l'annulation staff. Par le client ROUTÉ : dans l'unité de
 * travail du handler, où le guichet du fournil écrit aussi.
 *
 * Pas de mur tenant : la route est staff, et la surface admin voit toutes les
 * commandes.
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

  async cancel(orderId: string, record: CancellationRecord): Promise<boolean> {
    const stamp = {
      status: OrderStatus.cancelled,
      cancelledAt: record.cancelledAt,
      cancelledBy: record.cancelledBy,
      cancellationReason: record.reason,
    };
    // Deux écritures exclusives par leur `where`, comme `markAbandoned` : le
    // règlement d'une carte non payée tombe aussi (`failed`), le total nul
    // garde le sien (`not_required`). `status: placed` dans les deux : une
    // commande déjà annulée — par le balayage, par un autre membre de
    // l'équipe — ne franchit pas.
    const card = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.placed, paymentStatus: { in: [...DUE] } },
      data: { ...stamp, paymentStatus: PaymentStatus.failed },
    });
    if (card.count === 1) {
      return true;
    }
    const free = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: OrderStatus.placed,
        paymentStatus: PaymentStatus.not_required,
        totalCents: 0,
      },
      data: stamp,
    });
    return free.count === 1;
  }
}
