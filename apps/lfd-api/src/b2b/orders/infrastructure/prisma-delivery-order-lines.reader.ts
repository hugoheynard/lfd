import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderLine,
  DeliveryOrderLinesReader,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";

/**
 * **Les lignes d'une commande, relayées au colisage** — l'adaptateur de
 * `DeliveryOrderLinesReader` (plan de tournée, lot 4 bis, L4b-C4).
 *
 * Le SKU, le nom figé et la quantité ; **aucun montant**. Lu par identifiant
 * de commande pour le personnel du fournil (surface d'administration), comme
 * `PrismaDeliveryOrdersReader.byIds` : aucun mur de société à poser.
 */
@Injectable()
export class PrismaDeliveryOrderLinesReader extends DeliveryOrderLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async linesOf(orderId: string): Promise<readonly DeliveryOrderLine[]> {
    const rows = await this.prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
      select: LINE_SELECT,
    });
    return rows.map(toLine);
  }

  async linesOfMany(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryOrderLine[]>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderLine.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: { id: "asc" },
      select: { orderId: true, ...LINE_SELECT },
    });
    const byOrder = new Map<string, DeliveryOrderLine[]>();
    for (const row of rows) {
      byOrder.set(row.orderId, [...(byOrder.get(row.orderId) ?? []), toLine(row)]);
    }
    return byOrder;
  }
}

const LINE_SELECT = {
  sku: true,
  productNameSnapshot: true,
  quantity: true,
  saleUnit: true,
} as const;

function toLine(row: {
  readonly sku: string;
  readonly productNameSnapshot: string;
  readonly quantity: number;
  readonly saleUnit: string;
}): DeliveryOrderLine {
  return {
    sku: row.sku,
    name: row.productNameSnapshot,
    quantity: row.quantity,
    saleUnit: orderLineSaleUnitOf(row.sku, row.saleUnit),
  };
}
