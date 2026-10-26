import { Injectable } from "@nestjs/common";

import { OrderNoticeSummaryReader } from "../../orders/domain/ports/order-notice-summary.reader.js";
import { OrderAccessReader } from "../../orders/domain/ports/order-access.reader.js";
import { OrderReader } from "../../orders/domain/ports/order.reader.js";
import { isOrderVisible } from "../../orders/domain/services/order-access.js";
import type { ReportingSite } from "../domain/order-problem-reported.fact.js";
import {
  type ReportableOrder,
  ReportableOrderReader,
} from "../domain/ports/reportable-order.reader.js";

/**
 * La commande signalée, lue par les ports des COMMANDES et murée par LEUR
 * règle (`OrderAccessReader` + `isOrderVisible`, celle de `GetOrderHandler` —
 * vérifié le 2026-10-21) : aucune requête sur leurs tables d'ici, aucune
 * seconde règle. L'`owner`/`admin` du principal signale donc sur la
 * commande d'un site (lot C1 de `plan-commandes-des-sites.md`).
 */
@Injectable()
export class OrderReportableOrderReader extends ReportableOrderReader {
  constructor(
    private readonly orders: OrderReader,
    private readonly access: OrderAccessReader,
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
      owned.companyId === null ? null : await this.access.accessToOrder(actorUserId, owned);
    if (!isOrderVisible(owned, actorUserId, role)) {
      return null;
    }
    return {
      id: owned.view.id,
      number: owned.view.orderNumber,
      companyId: owned.companyId,
      // Plan E7 reliquat (L5a) : une partie reçue se signale déjà — le
      // problème porte sur ce qui est arrivé, le reste n'y change rien.
      fulfilled: owned.view.status === "fulfilled" || owned.view.status === "partially_handed_over",
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
