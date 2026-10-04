import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { OutboxDelivery } from "./outbox-delivery.js";
import { OutboxDeliveryRepository } from "./outbox-delivery.repository.js";
import { OutboxDeliveryAlreadyDeliveredError } from "./outbox-errors.js";

/** L'agrégat du rejeu manuel, chargé et sauvé entier. */
@Injectable()
export class PrismaOutboxDeliveryRepository extends OutboxDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(eventId: string, subscriber: string): Promise<OutboxDelivery | null> {
    const row = await this.prisma.outboxDelivery.findUnique({
      where: { eventId_subscriber: { eventId, subscriber } },
    });
    return row === null ? null : OutboxDelivery.rehydrate(row);
  }

  /**
   * Conditionnée sur `delivered_at IS NULL` : si le relais a livré entre le
   * chargement et l'écriture, le rejeu n'efface pas le reçu — il est refusé.
   */
  async save(delivery: OutboxDelivery): Promise<void> {
    const state = delivery.toState();
    const { count } = await this.prisma.outboxDelivery.updateMany({
      where: { eventId: state.eventId, subscriber: state.subscriber, deliveredAt: null },
      data: {
        attempts: state.attempts,
        nextAttemptAt: state.nextAttemptAt,
        claimedUntil: state.claimedUntil,
        lastError: state.lastError,
      },
    });
    if (count === 0) {
      throw new OutboxDeliveryAlreadyDeliveredError(state.eventId, state.subscriber);
    }
  }
}
