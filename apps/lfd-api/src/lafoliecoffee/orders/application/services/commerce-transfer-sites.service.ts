import { Injectable } from "@nestjs/common";

import {
  type TransferSiteFacts,
  TransferSitesReader,
} from "../../../../delivery/channels/commerce/index.js";
import { SiteArrivalOrdersReader } from "../../domain/ports/site-arrival-orders.reader.js";
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
 *
 * 🔴 **Les commandes qui fixent l'heure sont les retraits VIVANTS du jour**
 * (`SiteArrivalOrdersReader`), pas celles du plan (`planWhere`, `placed`
 * seul) : après l'arrêt, toutes les commandes sont `confirmed`, et le plan
 * n'en résoudrait plus le site.
 *
 * ## Le transfert arrive à la plus tôt des heures de ce qu'il porte
 *
 * `arrivalBy` est l'arrivée de `SiteDeadlines`, qui compose seule l'heure du
 * point et celles des réassorts « pour demain » envoyés : le compte à rebours
 * et la copie du colisage lisent la même. Un point SANS retrait mais avec un
 * réassort daté est résolu aussi (`forDay`, `alsoSiteIds`). L'arrivée ne
 * dépend pas du trajet : un calcul routier muet ne remet pas le transfert
 * sans fenêtre.
 */
@Injectable()
export class CommerceTransferSites extends TransferSitesReader {
  constructor(
    private readonly orders: SiteArrivalOrdersReader,
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
    const [pickups, settings] = await Promise.all([
      this.orders.forDay(day),
      this.settings.forDay(day, siteIds),
    ]);
    const deadlines = await this.deadlines.forDay(
      day,
      pickups.map(({ window, siteId }) => ({ fulfillmentMethod: "pickup", window, siteId })),
      siteIds,
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
