import { Injectable } from "@nestjs/common";

import { DeliveryAvailabilityReader } from "../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import {
  type DayDueThresholds,
  DayResuppliesReader,
  DueThresholdsReader,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { DeadlineOrdersReader } from "../../domain/ports/deadline-orders.reader.js";
import {
  type DeadlineOrder,
  deadlineThresholds,
} from "../../domain/services/deadline-thresholds.js";
import { resupplyDeadline } from "../../domain/services/resupply-deadline.js";
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
 * ## Les réassorts « pour demain » envoyés comptent aussi
 *
 * Les mêmes que l'arrêt fige (`DayResuppliesReader.placedFor`), traduits en
 * éléments de plus par `resupplyDeadline` : une seule arithmétique. Un point
 * qui ne reçoit que des réassorts est résolu aussi (`alsoSiteIds`). Vivant
 * comme pour les commandes : un réassort annulé en sort à la lecture suivante.
 *
 * Les trois lectures partent ensemble : aucune ne conditionne les autres.
 */
@Injectable()
export class DueThresholds extends DueThresholdsReader {
  constructor(
    private readonly orders: DeadlineOrdersReader,
    private readonly settings: DeliveryAvailabilityReader,
    private readonly sites: SiteDeadlines,
    private readonly resupplies: DayResuppliesReader,
  ) {
    super();
  }

  async dueThresholdsFor(day: ServiceDay): Promise<DayDueThresholds> {
    const [sited, settings, resupplies] = await Promise.all([
      this.orders.forDay(day.value),
      this.settings.current(),
      this.resupplies.placedFor(day),
    ]);
    const transferSiteIds = resupplies.flatMap((resupply) =>
      resupply.servedByTransfer ? [resupply.siteId] : [],
    );
    const sites = await this.sites.forDay(day.value, sited, transferSiteIds);
    const orders = sited.map(({ siteId, ...order }): DeadlineOrder => {
      const site = siteId === null ? undefined : sites.get(siteId);
      return site === undefined ? order : { ...order, site };
    });
    const elements = [
      ...orders,
      ...resupplies.map((resupply) => resupplyDeadline(resupply, sites.get(resupply.siteId))),
    ];
    const deliveryMarginMinutes = settings.deliveryMarginMinutes ?? null;
    const pickupMarginMinutes = settings.pickupMarginMinutes ?? null;
    return {
      deliveryMarginMinutes,
      pickupMarginMinutes,
      items: deadlineThresholds(elements, {
        deliveryMinutes: deliveryMarginMinutes,
        pickupMinutes: pickupMarginMinutes,
      }),
    };
  }
}
