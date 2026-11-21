import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StoredAccountAlert } from "../domain/ports/account-alert.repository.js";
import { AlertsOfOrders, OrderAlertsAcknowledger } from "../domain/ports/order-alerts.js";
import { isKnown, storedAlertOf } from "./prisma-account-alert.repository.js";

/** Les alertes d'une page de commandes, en une requête. */
@Injectable()
export class PrismaAlertsOfOrders extends AlertsOfOrders {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderIds: readonly string[]): Promise<StoredAccountAlert[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.accountAlert.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: { occurredAt: "desc" },
    });
    return rows.map((row) => storedAlertOf(row)).filter(isKnown);
  }
}

/**
 * Acquitte les alertes d'une commande sous la condition qu'elles attendent
 * encore (`acknowledgedAt: null`) : la même que l'acquittement à l'unité.
 */
@Injectable()
export class PrismaOrderAlertsAcknowledger extends OrderAlertsAcknowledger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acknowledgeOrder(orderId: string, staffUserId: string, at: Date): Promise<void> {
    await this.prisma.accountAlert.updateMany({
      where: { orderId, acknowledgedAt: null },
      data: { acknowledgedAt: at, acknowledgedBy: staffUserId },
    });
  }
}
