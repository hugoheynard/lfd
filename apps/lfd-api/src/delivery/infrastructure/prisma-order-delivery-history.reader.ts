import type { StopDecisionOutcome } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "../channels/commerce/order-delivery-history.reader.js";

const BRING_BACK: StopDecisionOutcome = "bring_back";

/**
 * **Ce que la livraison dit au dossier de facturation** : les arrêts, leur
 * tournée, et la décision « Rapporter » de chacun. Deux lectures par lot. Il
 * ne lit que les tables de la livraison.
 */
@Injectable()
export class PrismaOrderDeliveryHistoryReader extends OrderDeliveryHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofOrders(orderIds: readonly string[]): Promise<readonly OrderDeliveryStopFact[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const stops = await this.prisma.deliveryRoundStop.findMany({
      where: { orderId: { in: [...orderIds] }, removedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        orderId: true,
        serviceDay: true,
        createdAt: true,
        closedAt: true,
        round: { select: { departedAt: true } },
      },
    });
    const decisions = await this.prisma.deliveryStopDecision.findMany({
      where: {
        stopId: { in: stops.map((stop) => stop.id) },
        outcome: BRING_BACK,
        decidedAt: { not: null },
      },
      select: { stopId: true, decidedAt: true },
    });
    const broughtBack = new Map(decisions.map((row) => [row.stopId, row.decidedAt]));
    return stops.map((stop) => ({
      orderId: stop.orderId,
      serviceDay: stop.serviceDay,
      placedAt: stop.createdAt,
      departedAt: stop.round.departedAt,
      closedAt: stop.closedAt,
      broughtBackAt: broughtBack.get(stop.id) ?? null,
    }));
  }
}
