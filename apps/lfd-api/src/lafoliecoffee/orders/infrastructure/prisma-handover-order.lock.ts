import type { OrderStatus } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { HandoverOrderLock } from "../../../handover/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **La ligne `orders` verrouillée pour le retrait** — le même `FOR UPDATE`
 * que prend l'annulation en premier (`PrismaOrderCancellationRepository.lock`).
 *
 * Par le client ROUTÉ : dans l'unité de travail du retrait, où l'attestation
 * s'écrit. Le statut est relu APRÈS le verrou, par une seconde requête — en
 * `READ COMMITTED`, c'est elle qui voit l'annulation validée pendant l'attente.
 */
@Injectable()
export class PrismaHandoverOrderLock extends HandoverOrderLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockForHandover(orderId: string): Promise<OrderStatus | null> {
    const locked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ${orderId}
      FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    return row.status;
  }
}
