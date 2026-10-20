import { Injectable } from "@nestjs/common";

import { OrderNoticeSummaryReader } from "../../orders/domain/ports/order-notice-summary.reader.js";
import { OrderGuardReader } from "../../orders/domain/ports/order-guard.reader.js";
import { OrderReader } from "../../orders/domain/ports/order.reader.js";
import { isOrderVisible } from "../../orders/domain/services/order-access.js";
import type { ReportingSite } from "../domain/order-problem-reported.fact.js";
import {
  type ReportableOrder,
  ReportableOrderReader,
} from "../domain/ports/reportable-order.reader.js";

/**
 * La commande signalée, lue par les ports des COMMANDES et murée par LEUR
 * règle (`isOrderVisible`, celle de `GetOrderHandler` — vérifié le
 * 2026-10-09) : aucune requête sur leurs tables d'ici, aucune seconde règle.
 * Le rôle n'est demandé que pour une commande d'entreprise, comme là-bas.
 */
@Injectable()
export class OrderReportableOrderReader extends ReportableOrderReader {
  constructor(
    private readonly orders: OrderReader,
    private readonly guard: OrderGuardReader,
    private readonly notices: OrderNoticeSummaryReader,
  ) {
    super();
  }

  async visibleTo(orderId: string, actorUserId: string): Promise<ReportableOrder | null> {
    const owned = await this.orders.findById(orderId);
    if (owned === null) {
      return null;
    }
    const role =
      owned.companyId === null ? null : await this.guard.roleOf(actorUserId, owned.companyId);
    if (!isOrderVisible(owned, actorUserId, role)) {
      return null;
    }
    return {
      id: owned.view.id,
      number: owned.view.orderNumber,
      fulfilled: owned.view.status === "fulfilled",
      site: await this.siteOf(orderId),
    };
  }

  /**
   * Le site et son principal tels que la commande les a COPIÉS — par le port
   * qu'`orders/` exporte pour l'avis au principal, pas par une lecture de la
   * hiérarchie (`plan-notifications-sous-comptes.md`, N4a).
   */
  private async siteOf(orderId: string): Promise<ReportingSite | null> {
    const summary = await this.notices.summaryOf(orderId);
    if (summary === null || summary.companyId === null || summary.companyName === null) {
      return null;
    }
    return {
      companyId: summary.companyId,
      name: summary.companyName,
      principalCompanyId: summary.principalCompanyId,
    };
  }
}
