import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import {
  OutboxRelayStore,
  type ClaimRequest,
  type ClaimedDelivery,
  type DeliveryFailure,
} from "./outbox-relay-store.js";

interface ClaimedRow {
  readonly event_id: string;
  readonly subscriber: string;
  readonly attempts: number;
  readonly type: string;
  readonly payload: unknown;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}

/**
 * Le relais côté base. Toutes les écritures sont CONDITIONNÉES
 * (`delivered_at IS NULL`) : une livraison faite ne se défait ni ne se refait.
 */
@Injectable()
export class PrismaOutboxRelayStore extends OutboxRelayStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(request: ClaimRequest): Promise<readonly ClaimedDelivery[]> {
    const { now, leaseUntil, limit, maxAttempts } = request;
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE platform.outbox_delivery AS pending
      SET claimed_until = ${leaseUntil}::timestamptz
      FROM platform.outbox AS message
      WHERE message.id = pending.event_id
        AND (pending.event_id, pending.subscriber) IN (
          SELECT event_id, subscriber FROM platform.outbox_delivery
          WHERE delivered_at IS NULL
            AND attempts < ${maxAttempts}
            AND next_attempt_at <= ${now}::timestamptz
            AND (claimed_until IS NULL OR claimed_until < ${now}::timestamptz)
          ORDER BY next_attempt_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
      RETURNING pending.event_id, pending.subscriber, pending.attempts,
                message.type, message.payload
    `;
    return rows.map((row) => ({
      eventId: row.event_id,
      subscriber: row.subscriber,
      attempts: row.attempts,
      type: row.type,
      payload: asRecord(row.payload),
    }));
  }

  async acknowledge(eventId: string, subscriber: string, at: Date): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE platform.outbox_delivery
      SET delivered_at = ${at}::timestamptz, claimed_until = NULL
      WHERE event_id = ${eventId} AND subscriber = ${subscriber} AND delivered_at IS NULL
    `;
    return updated === 1;
  }

  async recordFailure(failure: DeliveryFailure): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE platform.outbox_delivery
      SET attempts = ${failure.attempts},
          next_attempt_at = ${failure.nextAttemptAt}::timestamptz,
          last_error = ${failure.error},
          claimed_until = NULL
      WHERE event_id = ${failure.eventId}
        AND subscriber = ${failure.subscriber}
        AND delivered_at IS NULL
    `;
  }
}
