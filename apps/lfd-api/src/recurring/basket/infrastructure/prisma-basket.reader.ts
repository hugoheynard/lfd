import {
  billingAddressPayloadSchema,
  fulfillmentMethodSchema,
  fulfillmentWindowSchema,
  recurrenceSchema,
  subscriptionStatusSchema,
  type AdminSubscriptionRow,
  type OccurrenceOverrideView,
  type SubscriptionView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CANCELLED_BASKET } from "../domain/entities/basket.js";
import { type BasketBuyerName, BasketReader } from "../domain/ports/basket.reader.js";

/** Lignes de dérogation persistées (JSON) : SKU + quantité. */
const overrideLinesSchema = z.array(z.object({ sku: z.string(), quantity: z.number().int() }));

/**
 * Adaptateur Prisma de lecture des paniers, plus récents d'abord. Les
 * dérogations de la vue sont les échéances sautées ou à lignes propres.
 */
@Injectable()
export class PrismaBasketReader extends BasketReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForBuyer(buyerUserId: string): Promise<readonly SubscriptionView[]> {
    const rows = await this.prisma.basket.findMany({
      where: { buyerUserId, status: { not: CANCELLED_BASKET } },
      orderBy: { createdAt: "desc" },
      select: SELECT,
    });
    return rows.map(toView);
  }

  async listForBuyers(
    buyers: readonly BasketBuyerName[],
  ): Promise<readonly AdminSubscriptionRow[]> {
    const names = new Map(buyers.map((buyer) => [buyer.userId, buyer.name]));
    const rows = await this.prisma.basket.findMany({
      where: { buyerUserId: { in: [...names.keys()] }, status: { not: CANCELLED_BASKET } },
      orderBy: { createdAt: "desc" },
      select: { ...SELECT, buyerUserId: true },
    });
    return rows.map((row) => ({
      ...toView(row),
      placedByUserId: row.buyerUserId,
      placedByName: names.get(row.buyerUserId) ?? row.buyerUserId,
    }));
  }
}

/** Ce qu'une vue de panier lit — partagé par les deux murs. */
const SELECT = {
  id: true,
  cadence: true,
  status: true,
  startDate: true,
  endDate: true,
  fulfillmentMethod: true,
  deliveryAddress: true,
  pickupAddressId: true,
  requestedWindow: true,
  note: true,
  createdAt: true,
  lines: { select: { sku: true, quantity: true }, orderBy: { position: "asc" } },
  occurrences: {
    where: { OR: [{ state: "skipped" }, { lines: { not: Prisma.DbNull } }] },
    select: { serviceDay: true, state: true, lines: true, note: true },
    orderBy: { serviceDay: "asc" },
  },
} satisfies Prisma.BasketSelect;

interface ViewRow {
  readonly id: string;
  readonly cadence: string;
  readonly status: string;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly fulfillmentMethod: string;
  readonly deliveryAddress: Prisma.JsonValue;
  readonly pickupAddressId: string | null;
  readonly requestedWindow: Prisma.JsonValue;
  readonly note: string;
  readonly createdAt: Date;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  readonly occurrences: readonly {
    readonly serviceDay: Date;
    readonly state: string;
    readonly lines: Prisma.JsonValue;
    readonly note: string;
  }[];
}

function toView(row: ViewRow): SubscriptionView {
  return {
    id: row.id,
    recurrence: recurrenceSchema.parse(row.cadence),
    status: subscriptionStatusSchema.parse(row.status),
    startDate: dateOnly(row.startDate),
    endDate: row.endDate === null ? null : dateOnly(row.endDate),
    fulfillmentMethod: fulfillmentMethodSchema.parse(row.fulfillmentMethod),
    deliveryAddress:
      row.deliveryAddress === null ? null : billingAddressPayloadSchema.parse(row.deliveryAddress),
    pickupAddressId: row.pickupAddressId,
    requestedWindow: fulfillmentWindowSchema.parse(row.requestedWindow),
    note: row.note,
    lines: row.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    overrides: row.occurrences.map(toOverride),
    createdAt: row.createdAt.toISOString(),
  };
}

function toOverride(occurrence: ViewRow["occurrences"][number]): OccurrenceOverrideView {
  const skipped = occurrence.state === "skipped";
  return {
    date: dateOnly(occurrence.serviceDay),
    skipped,
    lines: skipped || occurrence.lines === null ? [] : overrideLinesSchema.parse(occurrence.lines),
    note: occurrence.note,
  };
}

/** `Date` → `AAAA-MM-JJ` (colonne `@db.Date`, minuit UTC). */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
