import { Injectable } from "@nestjs/common";

import { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  type CreatedSubscription,
  type OccurrenceOverrideToUpsert,
  SubscriptionRepository,
  type SubscriptionToCreate,
} from "../domain/ports/subscription.repository.js";

/** Adaptateur Prisma d'écriture : crée l'abonnement et ses lignes en une passe. */
@Injectable()
export class PrismaSubscriptionRepository extends SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(subscription: SubscriptionToCreate): Promise<CreatedSubscription> {
    const created = await this.prisma.subscription.create({
      data: {
        placedByUserId: subscription.placedByUserId,
        fromOrderId: subscription.fromOrderId,
        recurrence: subscription.recurrence,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        fulfillmentMethod: subscription.fulfillmentMethod,
        deliveryAddressSnapshot: subscription.deliveryAddress ?? Prisma.DbNull,
        pickupAddressId: subscription.pickupAddressId,
        note: subscription.note,
        lines: {
          create: subscription.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        },
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async upsertOccurrence(override: OccurrenceOverrideToUpsert): Promise<void> {
    const lines = override.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }));
    await this.prisma.subscriptionOccurrence.upsert({
      where: {
        subscriptionId_occurrenceDate: {
          subscriptionId: override.subscriptionId,
          occurrenceDate: override.occurrenceDate,
        },
      },
      create: {
        subscriptionId: override.subscriptionId,
        occurrenceDate: override.occurrenceDate,
        skipped: override.skipped,
        lines,
        note: override.note,
      },
      update: { skipped: override.skipped, lines, note: override.note },
    });
  }
}
