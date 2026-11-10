import { Injectable } from "@nestjs/common";

import {
  DayOrdersReader,
  type ProducibleOrder,
  type ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import { DayOrdersSource } from "../../domain/ports/day-orders.source.js";
import { destinationDueAt } from "../../domain/services/deadline-thresholds.js";
import { SiteDeadlines } from "./site-deadlines.service.js";

/**
 * **Le commerce répond au fournil : ce qu'il y a à produire ce jour-là**, avec
 * l'échéance de chaque commande calculée depuis son site (lot T0).
 *
 * Implémente le port que la production déclare (`DayOrdersReader`), relié dans
 * `appBootstrap/production-feed.module.ts`. La base rend les commandes et leur
 * fenêtre (`DayOrdersSource`) ; `SiteDeadlines` résout les sites ; la règle de
 * l'heure « à destination » est la fonction pure `destinationDueAt`.
 *
 * Une commande sans site (livraison, ou passée avant S2) garde l'ancien
 * calcul : le début de sa fenêtre, sinon sa fin.
 */
@Injectable()
export class SitedDayOrders extends DayOrdersReader {
  constructor(
    private readonly source: DayOrdersSource,
    private readonly sites: SiteDeadlines,
  ) {
    super();
  }

  async producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]> {
    const sourced = await this.source.producibleFor(day);
    const sites = await this.sites.forDay(
      day.value,
      sourced.map(({ order, window }) => ({
        fulfillmentMethod: order.fulfillmentMethod,
        window,
        siteId: order.siteId,
      })),
    );
    return sourced.map(({ order, window }) => {
      const site = order.siteId === null ? undefined : sites.get(order.siteId);
      return {
        ...order,
        dueAt: destinationDueAt({
          fulfillmentMethod: order.fulfillmentMethod,
          window,
          lines: order.lines,
          ...(site === undefined ? {} : { site }),
        }),
      };
    });
  }
}
