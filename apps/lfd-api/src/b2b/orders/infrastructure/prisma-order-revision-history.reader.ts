import {
  billingAddressPayloadSchema,
  fulfillmentMethodSchema,
  ORDER_REVISION_CHANGES,
  orderFulfillmentSchema,
  type OrderRevisionChange,
  type ReplacedCompositionView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderRevisionHistoryReader,
  type RecordedOrderRevision,
} from "../domain/ports/order-revision-history.reader.js";

/**
 * La composition remplacée, telle que `revisedCompositionOf` l'écrit — sous
 * les noms des colonnes. Validée plutôt que castée : un JSON d'une autre forme
 * rend `null`, jamais une composition inventée. Les champs que la vue ne
 * montre pas (trace de prix, allergènes) restent en base, ignorés ici.
 */
const lineSchema = z.object({
  sku: z.string(),
  productNameSnapshot: z.string(),
  quantity: z.number().int(),
  unitPriceMillicents: z.number().int(),
  vatRate: z.number(),
  lineTotalCents: z.number().int(),
});

const compositionSchema = z.object({
  requestedDeliveryDate: z.string().nullable(),
  fulfillmentMethod: fulfillmentMethodSchema,
  pickupAddress: billingAddressPayloadSchema.nullable(),
  deliveryAddressSnapshot: billingAddressPayloadSchema.nullable(),
  // Une forme inattendue ne fait pas tomber la composition : seul le créneau se tait.
  fulfillment: orderFulfillmentSchema.nullable().catch(null),
  note: z.string(),
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  deliveryFeeCents: z.number().int(),
  vatCents: z.number().int(),
  totalCents: z.number().int(),
  lines: z.array(lineSchema),
});

const KNOWN_CHANGES: ReadonlySet<string> = new Set(ORDER_REVISION_CHANGES);

/** Adaptateur Prisma de l'historique des révisions (`public.order_revision`). */
@Injectable()
export class PrismaOrderRevisionHistoryReader extends OrderRevisionHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async historyOf(orderId: string): Promise<readonly RecordedOrderRevision[] | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (order === null) {
      return null;
    }
    const rows = await this.prisma.orderRevisionEntry.findMany({
      where: { orderId },
      orderBy: { replacedRevision: "desc" },
    });
    const customers = await this.customerNames(
      rows.flatMap((row) => (row.revisedByUserId === null ? [] : [row.revisedByUserId])),
    );
    return rows.map((row) => ({
      replacedRevision: row.replacedRevision,
      revisedAt: row.revisedAt,
      author:
        row.revisedByKind === "staff"
          ? { kind: "staff", staffId: row.revisedByStaffId }
          : { kind: "customer", name: customers.get(row.revisedByUserId ?? "") ?? null },
      changes: row.changes.filter(isKnownChange),
      totalBeforeCents: row.totalBeforeCents,
      totalAfterCents: row.totalAfterCents,
      replaced: compositionOf(row.composition),
    }));
  }

  private async customerNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.flatMap((user) => {
        const name = `${user.firstName} ${user.lastName}`.trim();
        return name === "" ? [] : [[user.id, name] as const];
      }),
    );
  }
}

function isKnownChange(change: string): change is OrderRevisionChange {
  return KNOWN_CHANGES.has(change);
}

function compositionOf(value: Prisma.JsonValue): ReplacedCompositionView | null {
  const parsed = compositionSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const composition = parsed.data;
  return {
    requestedDeliveryDate: composition.requestedDeliveryDate,
    fulfillmentMethod: composition.fulfillmentMethod,
    pickupAddress: composition.pickupAddress,
    deliveryAddress: composition.deliveryAddressSnapshot,
    window: composition.fulfillment?.window.value ?? null,
    note: composition.note,
    subtotalCents: composition.subtotalCents,
    discountCents: composition.discountCents,
    deliveryFeeCents: composition.deliveryFeeCents,
    vatCents: composition.vatCents,
    totalCents: composition.totalCents,
    lines: composition.lines.map((line) => ({
      sku: line.sku,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      unitPriceMillicents: line.unitPriceMillicents,
      vatRate: line.vatRate,
      lineTotalCents: line.lineTotalCents,
    })),
  };
}
