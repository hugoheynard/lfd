import {
  billingAddressPayloadSchema,
  recurrenceSchema,
  subscriptionStatusSchema,
  type OccurrenceOverrideView,
  type SubscriptionView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { SubscriptionReader } from "../domain/ports/subscription.reader.js";

/** Adaptateur Prisma de lecture : les abonnements de la personne, plus récents d'abord. */
@Injectable()
export class PrismaSubscriptionReader extends SubscriptionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForUser(userId: string): Promise<readonly SubscriptionView[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { placedByUserId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        recurrence: true,
        status: true,
        startDate: true,
        endDate: true,
        fulfillmentMethod: true,
        deliveryAddressSnapshot: true,
        pickupAddressId: true,
        note: true,
        createdAt: true,
        lines: { select: { sku: true, quantity: true } },
        occurrences: {
          select: { occurrenceDate: true, skipped: true, lines: true, note: true },
          orderBy: { occurrenceDate: "asc" },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      recurrence: recurrenceSchema.parse(row.recurrence),
      status: subscriptionStatusSchema.parse(row.status),
      startDate: dateOnly(row.startDate),
      endDate: row.endDate === null ? null : dateOnly(row.endDate),
      fulfillmentMethod: row.fulfillmentMethod,
      deliveryAddress: parseAddress(row.deliveryAddressSnapshot),
      pickupAddressId: row.pickupAddressId,
      note: row.note,
      lines: row.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      overrides: row.occurrences.map((occ) => toOverride(occ)),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async findOwner(subscriptionId: string): Promise<string | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { placedByUserId: true },
    });
    return row?.placedByUserId ?? null;
  }
}

/** Ligne de dérogation persistée (JSON) : SKU + quantité. */
const overrideLineSchema = z.object({ sku: z.string(), quantity: z.number().int() });

/** Row `subscription_occurrences` → vue de dérogation d'échéance. */
function toOverride(occ: {
  occurrenceDate: Date;
  skipped: boolean;
  lines: Prisma.JsonValue;
  note: string;
}): OccurrenceOverrideView {
  return {
    date: dateOnly(occ.occurrenceDate),
    skipped: occ.skipped,
    lines: z.array(overrideLineSchema).parse(occ.lines),
    note: occ.note,
  };
}

/** `Date` → `AAAA-MM-JJ` (colonne `@db.Date`, minuit UTC). */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Snapshot JSON → adresse de facturation, ou `null`. */
function parseAddress(value: Prisma.JsonValue | null): SubscriptionView["deliveryAddress"] {
  return value === null ? null : billingAddressPayloadSchema.parse(value);
}
