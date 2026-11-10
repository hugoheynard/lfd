import { Injectable } from "@nestjs/common";

import { DeliveryAvailabilityReader } from "../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import {
  type DayDueThresholds,
  DueThresholdsReader,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { DeadlineOrdersReader } from "../../domain/ports/deadline-orders.reader.js";
import {
  type DeadlineOrder,
  deadlineThresholds,
} from "../../domain/services/deadline-thresholds.js";
import { SiteDeadlines } from "./site-deadlines.service.js";

/**
 * **Le commerce répond au fournil : avant quelle heure sortir quoi** (plan
 * production par vagues, V0).
 *
 * Implémente le port que la production déclare (`DueThresholdsReader`) ; relié
 * dans `appBootstrap/production-feed.module.ts`. Il lit deux ports du commerce
 * — les commandes du jour et le réglage qui porte les marges —, résout le site
 * de chaque retrait (`SiteDeadlines`, lot T0) et passe le tout à la fonction
 * pure `deadlineThresholds`, qui porte la règle.
 *
 * Les deux lectures partent ensemble : aucune ne conditionne l'autre.
 */
@Injectable()
export class DueThresholds extends DueThresholdsReader {
  constructor(
    private readonly orders: DeadlineOrdersReader,
    private readonly settings: DeliveryAvailabilityReader,
    private readonly sites: SiteDeadlines,
  ) {
    super();
  }

  async dueThresholdsFor(day: ServiceDay): Promise<DayDueThresholds> {
    const [sited, settings] = await Promise.all([
      this.orders.forDay(day.value),
      this.settings.current(),
    ]);
    const sites = await this.sites.forDay(day.value, sited);
    const orders = sited.map(({ siteId, ...order }): DeadlineOrder => {
      const site = siteId === null ? undefined : sites.get(siteId);
      return site === undefined ? order : { ...order, site };
    });
    const deliveryMarginMinutes = settings.deliveryMarginMinutes ?? null;
    const pickupMarginMinutes = settings.pickupMarginMinutes ?? null;
    return {
      deliveryMarginMinutes,
      pickupMarginMinutes,
      items: deadlineThresholds(orders, {
        deliveryMinutes: deliveryMarginMinutes,
        pickupMinutes: pickupMarginMinutes,
      }),
    };
  }
}
