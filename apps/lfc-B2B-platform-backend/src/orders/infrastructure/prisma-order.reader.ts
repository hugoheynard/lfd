import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type FulfillmentMethod,
  type OrderLineView,
  type OrderStatus,
  type OrderView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { OrderReader } from "../domain/ports/order.reader.js";

/** Une ligne de commande telle que Prisma la sélectionne. */
interface OrderLineRow {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly unitPriceCents: number;
  readonly vatRate: { toNumber(): number };
  readonly quantity: number;
  readonly lineTotalCents: number;
}

/** Une commande telle que Prisma la sélectionne. */
interface OrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly requestedDeliveryDate: Date | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddressId: string | null;
  readonly pickupAddress: Prisma.JsonValue | null;
  readonly note: string;
  readonly subtotalCents: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly lines: readonly OrderLineRow[];
}

/** Lecture des commandes d'une entreprise, la plus récente en tête. */
@Injectable()
export class PrismaOrderReader extends OrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByCompany(companyId: string): Promise<readonly OrderView[]> {
    const rows = await this.prisma.order.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        requestedDeliveryDate: true,
        fulfillmentMethod: true,
        deliveryAddressId: true,
        pickupAddress: true,
        note: true,
        subtotalCents: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        lines: {
          select: {
            sku: true,
            productNameSnapshot: true,
            unitPriceCents: true,
            vatRate: true,
            quantity: true,
            lineTotalCents: true,
          },
        },
      },
    });
    return rows.map((row) => toOrderView(row));
  }
}

/** Une date `@db.Date` → `YYYY-MM-DD`, ou `null`. */
function toIsoDate(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/** Valide le JSON de l'adresse de retrait figée, ou `null` (commande en livraison). */
function parsePickup(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  return value === null ? null : billingAddressPayloadSchema.parse(value);
}

function toOrderView(row: OrderRow): OrderView {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    requestedDeliveryDate: toIsoDate(row.requestedDeliveryDate),
    fulfillmentMethod: row.fulfillmentMethod,
    deliveryAddressId: row.deliveryAddressId,
    pickupAddress: parsePickup(row.pickupAddress),
    note: row.note,
    subtotalCents: row.subtotalCents,
    totalCents: row.totalCents,
    currency: row.currency,
    placedAt: row.createdAt.toISOString(),
    lines: row.lines.map(toLineView),
  };
}

function toLineView(line: OrderLineRow): OrderLineView {
  return {
    sku: line.sku,
    productName: line.productNameSnapshot,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate.toNumber(),
    quantity: line.quantity,
    lineTotalCents: line.lineTotalCents,
  };
}
