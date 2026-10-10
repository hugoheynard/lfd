import type { DeadLettersView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { DeadLettersReader } from "./dead-letters.reader.js";
import { MAX_DELIVERY_ATTEMPTS } from "./retry-policy.js";

/**
 * Les messages morts, lus dans `platform.outbox_delivery` : non livrés
 * (`delivered_at IS NULL`) et essais épuisés — la même borne que
 * `isExhausted`, lue de `MAX_DELIVERY_ATTEMPTS` et non recopiée. Le corps du
 * fait n'est pas lu.
 */
@Injectable()
export class PrismaDeadLettersReader extends DeadLettersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(limit: number): Promise<DeadLettersView> {
    const rows = await this.prisma.outboxDelivery.findMany({
      where: { deliveredAt: null, attempts: { gte: MAX_DELIVERY_ATTEMPTS } },
      select: {
        eventId: true,
        subscriber: true,
        attempts: true,
        lastError: true,
        message: { select: { type: true, key: true, occurredAt: true } },
      },
      orderBy: [{ message: { occurredAt: "desc" } }, { subscriber: "asc" }],
      // Un de plus que la borne : c'est lui qui dit que la liste est coupée.
      take: limit + 1,
    });
    return {
      letters: rows.slice(0, limit).map((row) => ({
        eventId: row.eventId,
        subscriber: row.subscriber,
        type: row.message.type,
        key: row.message.key,
        occurredAt: row.message.occurredAt.toISOString(),
        attempts: row.attempts,
        lastError: row.lastError,
      })),
      truncated: rows.length > limit,
    };
  }
}
