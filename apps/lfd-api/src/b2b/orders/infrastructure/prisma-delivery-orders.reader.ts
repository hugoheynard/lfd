import { Injectable } from "@nestjs/common";

import {
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  DeliveryOrdersReader,
} from "../../../delivery/channels/commerce/index.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { expectedOnWhere } from "./handover-order.query.js";

/** Ce que la composition lit d'une commande : ni montant, ni adresse. */
const DELIVERY_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  requestedDeliveryDate: true,
} as const;

interface DeliveryOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly fulfillmentMethod: string;
  readonly requestedDeliveryDate: Date | null;
}

/**
 * **Ce que le commerce rend pour la composition des tournées** — l'adaptateur
 * de `DeliveryOrdersReader` (plan de tournée, lot 3, C4, C15).
 *
 * « Attendue ce jour » est `expectedOnWhere`, le filtre de la file du comptoir
 * et de la feuille de route, restreint au coursier comme la feuille de route :
 * une seule vérité sur ce qui part. Les annulées sont rendues — « à répartir »
 * les écarte, les arrêts les signalent.
 *
 * Le jour demandé est une clé de journée écrite en minuit UTC
 * (`expectedOnWhere`) : il se relit de la même façon, jamais comme un instant.
 */
@Injectable()
export class PrismaDeliveryOrdersReader extends DeliveryOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async expectedOn(day: string): Promise<readonly DeliveryOrderRef[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...expectedOnWhere(day), fulfillmentMethod: "delivery" },
      orderBy: { createdAt: "asc" },
      select: DELIVERY_ORDER_SELECT,
    });
    return rows.map((row) => refOf(row));
  }

  async byIds(orderIds: readonly string[]): Promise<readonly DeliveryOrderFacts[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: DELIVERY_ORDER_SELECT,
    });
    return rows.map((row) => ({
      ...refOf(row),
      day: row.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      delivery: row.fulfillmentMethod === "delivery",
    }));
  }
}

function refOf(row: DeliveryOrderRow): DeliveryOrderRef {
  return {
    orderId: row.id,
    reference: row.orderNumber,
    status: row.status === "cancelled" ? "cancelled" : "active",
  };
}
