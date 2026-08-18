import {
  billingAddressPayloadSchema,
  recurrenceSchema,
  subscriptionStatusSchema,
  type AdminSubscriptionRow,
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
      select: SELECT,
    });
    return rows.map((row) => toView(row));
  }

  /**
   * Les paniers des **membres** de la société. Le lien passe par `memberships` :
   * un abonnement porte une personne, jamais une société — la société n'est
   * qu'un regroupement, et c'est la raison d'être de `placedByName`.
   */
  async listForCompany(companyId: string): Promise<readonly AdminSubscriptionRow[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { placedBy: { memberships: { some: { companyId } } } },
      orderBy: { createdAt: "desc" },
      select: {
        ...SELECT,
        placedByUserId: true,
        placedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((row) => ({
      ...toView(row),
      placedByUserId: row.placedByUserId,
      placedByName: displayName(row.placedBy),
    }));
  }
}

/** Le nom d'usage du client, ou son e-mail quand il n'en a pas encore. */
function displayName(user: { firstName: string; lastName: string; email: string }): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name === "" ? user.email : name;
}

/** Ce qu'une vue d'abonnement lit — partagé par les deux murs. */
const SELECT = {
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
} as const;

/** Une ligne relue, telle que `SELECT` la rend. */
interface SubscriptionRow {
  id: string;
  recurrence: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  fulfillmentMethod: SubscriptionView["fulfillmentMethod"];
  deliveryAddressSnapshot: Prisma.JsonValue | null;
  pickupAddressId: string | null;
  note: string;
  createdAt: Date;
  lines: { sku: string; quantity: number }[];
  occurrences: { occurrenceDate: Date; skipped: boolean; lines: Prisma.JsonValue; note: string }[];
}

function toView(row: SubscriptionRow): SubscriptionView {
  return {
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
  };
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
