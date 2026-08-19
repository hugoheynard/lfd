import {
  billingAddressPayloadSchema,
  recurrenceSchema,
  subscriptionStatusSchema,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  Subscription,
  type PersistedOverride,
  type SubscriptionState,
} from "../domain/entities/subscription.js";
import { IsoDate } from "../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../domain/value-objects/subscription-line.js";
import {
  type CreatedSubscription,
  SubscriptionRepository,
} from "../domain/ports/subscription.repository.js";

/** Lignes de dérogation persistées (JSON) : SKU + quantité. */
const overrideLineSchema = z.object({ sku: z.string(), quantity: z.number().int() });

/**
 * Adaptateur Prisma d'écriture — traduit l'**agrégat** ↔ les tables. C'est le
 * seul endroit qui connaît Prisma : `toDomain` reconstitue l'agrégat (ses
 * value-objects revalident), `toPersistence()` le sérialise. `save` réconcilie
 * les dérogations dans une transaction (l'agrégat et ses enfants sont indissociables).
 */
@Injectable()
export class PrismaSubscriptionRepository extends SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(subscription: Subscription): Promise<CreatedSubscription> {
    const state = subscription.toPersistence();
    const created = await this.prisma.subscription.create({
      data: {
        placedByUserId: state.placedByUserId,
        fromOrderId: state.fromOrderId,
        recurrence: state.recurrence,
        status: state.status,
        startDate: state.startDate,
        endDate: state.endDate,
        fulfillmentMethod: state.fulfillmentMethod,
        deliveryAddressSnapshot: state.deliveryAddress ?? Prisma.DbNull,
        pickupAddressId: state.pickupAddressId,
        note: state.note,
        lines: { create: state.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })) },
        occurrences: { create: state.overrides.map(toOccurrenceData) },
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async load(subscriptionId: string, ownerUserId: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, placedByUserId: ownerUserId },
      include: {
        lines: { select: { sku: true, quantity: true } },
        occurrences: { select: { occurrenceDate: true, skipped: true, lines: true, note: true } },
      },
    });
    return row === null ? null : toDomain(row);
  }

  async save(subscription: Subscription): Promise<void> {
    const state = subscription.toPersistence();
    const id = state.id;
    if (id === null) {
      throw new Error("save() attend un agrégat déjà persisté (id manquant).");
    }
    const dates = state.overrides.map((override) => override.occurrenceDate);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id }, data: { status: state.status } });
      await tx.subscriptionOccurrence.deleteMany({
        where: { subscriptionId: id, occurrenceDate: { notIn: dates } },
      });
      for (const override of state.overrides) {
        await tx.subscriptionOccurrence.upsert({
          where: {
            subscriptionId_occurrenceDate: {
              subscriptionId: id,
              occurrenceDate: override.occurrenceDate,
            },
          },
          create: { subscriptionId: id, ...toOccurrenceData(override) },
          update: {
            skipped: override.skipped,
            lines: override.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
            note: override.note,
          },
        });
      }
    });
  }

  async remove(subscriptionId: string): Promise<void> {
    await this.prisma.subscription.delete({ where: { id: subscriptionId } });
  }
}

/** Une dérogation → les colonnes d'une ligne `subscription_occurrences`. */
function toOccurrenceData(override: PersistedOverride): {
  occurrenceDate: Date;
  skipped: boolean;
  lines: Prisma.InputJsonValue;
  note: string;
} {
  return {
    occurrenceDate: override.occurrenceDate,
    skipped: override.skipped,
    lines: override.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    note: override.note,
  };
}

/** Row Prisma (abonnement + lignes + dérogations) → agrégat reconstitué. */
function toDomain(row: {
  id: string;
  placedByUserId: string;
  fromOrderId: string | null;
  recurrence: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  fulfillmentMethod: SubscriptionState["fulfillmentMethod"];
  deliveryAddressSnapshot: Prisma.JsonValue;
  pickupAddressId: string | null;
  note: string;
  lines: readonly { sku: string; quantity: number }[];
  occurrences: readonly {
    occurrenceDate: Date;
    skipped: boolean;
    lines: Prisma.JsonValue;
    note: string;
  }[];
}): Subscription {
  return Subscription.reconstitute({
    id: row.id,
    placedByUserId: row.placedByUserId,
    fromOrderId: row.fromOrderId,
    recurrence: recurrenceSchema.parse(row.recurrence),
    status: subscriptionStatusSchema.parse(row.status),
    startDate: IsoDate.fromDate(row.startDate),
    endDate: row.endDate === null ? null : IsoDate.fromDate(row.endDate),
    routing: {
      method: row.fulfillmentMethod,
      deliveryAddress:
        row.deliveryAddressSnapshot === null
          ? null
          : billingAddressPayloadSchema.parse(row.deliveryAddressSnapshot),
      pickupAddressId: row.pickupAddressId,
    },
    note: row.note,
    lines: row.lines.map((line) => SubscriptionLine.create(line.sku, line.quantity)),
    overrides: row.occurrences.map((occ) => ({
      date: IsoDate.fromDate(occ.occurrenceDate),
      skipped: occ.skipped,
      lines: z
        .array(overrideLineSchema)
        .parse(occ.lines)
        .map((l) => SubscriptionLine.create(l.sku, l.quantity)),
      note: occ.note,
    })),
  });
}
