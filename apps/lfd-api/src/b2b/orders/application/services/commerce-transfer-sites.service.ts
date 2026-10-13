import { Injectable } from "@nestjs/common";

import {
  type TransferSiteFacts,
  TransferSitesReader,
} from "../../../../delivery/channels/commerce/index.js";
import { ServiceDay } from "../../../../production/channels/commerce/index.js";
import { DayOrdersSource } from "../../domain/ports/day-orders.source.js";
import { SiteDaySettingsReader } from "../../domain/ports/site-day-settings.reader.js";
import { SiteDeadlines } from "./site-deadlines.service.js";

/**
 * **Le commerce répond à la livraison : de quoi placer le transfert d'un
 * site** (plan du transfert interne, §5, lot T1) — nom, point GPS, mode, et
 * l'heure d'arrivée requise, calculée par la MÊME règle que l'échéance du
 * fournil (`SiteDeadlines`, T0) : une seule vérité sur l'heure à tenir.
 *
 * Implémente le port que la livraison déclare, relié dans
 * `appBootstrap/delivery-feed.module.ts`. Lu hors transaction : le trajet
 * passe par le calcul routier.
 */
@Injectable()
export class CommerceTransferSites extends TransferSitesReader {
  constructor(
    private readonly source: DayOrdersSource,
    private readonly settings: SiteDaySettingsReader,
    private readonly deadlines: SiteDeadlines,
  ) {
    super();
  }

  async sitesFor(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, TransferSiteFacts>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const [sourced, settings] = await Promise.all([
      this.source.producibleFor(ServiceDay.of(day)),
      this.settings.forDay(day, siteIds),
    ]);
    const deadlines = await this.deadlines.forDay(
      day,
      sourced.map(({ order, window }) => ({
        fulfillmentMethod: order.fulfillmentMethod,
        window,
        siteId: order.siteId,
      })),
    );
    const facts = new Map<string, TransferSiteFacts>();
    for (const siteId of siteIds) {
      const site = settings.get(siteId);
      if (site === undefined) {
        continue;
      }
      const deadline = deadlines.get(siteId);
      facts.set(siteId, {
        siteId,
        label: site.label,
        gps: site.gps,
        mode: site.transferMode,
        arrivalBy: deadline?.supply === "transfer" ? deadline.arrivalBy : null,
      });
    }
    return facts;
  }
}
