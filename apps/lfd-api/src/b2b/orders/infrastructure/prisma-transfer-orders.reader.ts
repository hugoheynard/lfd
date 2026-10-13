import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderLine,
  TransferOrderContentsReader,
  type TransferOrderRef,
  TransferOrdersReader,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { siteIdOf } from "./pickup-site.parse.js";

/** Ce qui n'est pas (ou plus) une commande : un brouillon, une annulée. */
const NOT_ACTIVE = ["draft", "cancelled"] as const;

/**
 * **Les retraits des sites servis par transfert** — l'adaptateur de
 * `TransferOrdersReader` (plan du transfert interne, lot T1).
 *
 * Le commerce décide : une commande active, en retrait, dont le site FIGÉ à la
 * passation (S2) est approvisionné par transfert AUJOURD'HUI. Une commande
 * passée avant S2 n'a pas de site : elle n'entre dans aucun transfert (Q-S2,
 * aucun rattrapage par libellé). Par identifiant, pour la surface du
 * personnel : aucun mur de société à poser (comme `PrismaDeliveryOrdersReader.byIds`).
 */
@Injectable()
export class PrismaTransferOrdersReader extends TransferOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async transferOrdersAmong(orderIds: readonly string[]): Promise<readonly TransferOrderRef[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: {
        id: { in: [...orderIds] },
        fulfillmentMethod: "pickup",
        status: { notIn: [...NOT_ACTIVE] },
        requestedDeliveryDate: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, pickupAddress: true, requestedDeliveryDate: true },
    });
    const sited = rows.flatMap((row) => {
      const siteId = siteIdOf(row.pickupAddress);
      const day = row.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null;
      return siteId === null || day === null ? [] : [{ orderId: row.id, siteId, day }];
    });
    const sites = await this.prisma.site.findMany({
      where: { id: { in: [...new Set(sited.map((order) => order.siteId))] }, supply: "transfer" },
      select: { id: true, label: true },
    });
    const labels = new Map(sites.map((site) => [site.id, site.label]));
    return sited.flatMap((order) => {
      const siteLabel = labels.get(order.siteId);
      return siteLabel === undefined ? [] : [{ ...order, siteLabel }];
    });
  }
}

/**
 * **Le contenu des commandes d'un transfert** — l'adaptateur de
 * `TransferOrderContentsReader` (décision de Hugo du 2026-10-13, le
 * manifeste). Le SKU, le nom figé, la quantité ; **aucun montant**. Une
 * lecture pour tout le lot.
 */
@Injectable()
export class PrismaTransferOrderContentsReader extends TransferOrderContentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async contentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly DeliveryOrderLine[]>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderLine.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ orderId: "asc" }, { id: "asc" }],
      select: { orderId: true, sku: true, productNameSnapshot: true, quantity: true },
    });
    const byOrder = new Map<string, DeliveryOrderLine[]>();
    for (const row of rows) {
      const line = { sku: row.sku, name: row.productNameSnapshot, quantity: row.quantity };
      byOrder.set(row.orderId, [...(byOrder.get(row.orderId) ?? []), line]);
    }
    return byOrder;
  }
}
