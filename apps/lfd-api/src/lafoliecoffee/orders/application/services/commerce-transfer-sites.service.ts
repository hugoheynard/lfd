import { Injectable } from "@nestjs/common";

import {
  type TransferSiteFacts,
  TransferSitesReader,
} from "../../../../delivery/channels/commerce/index.js";
import { PlacedResupplyArrivals } from "../../../resupply/domain/placed-resupply-arrivals.reader.js";
import {
  type SiteArrivalOrder,
  SiteArrivalOrdersReader,
} from "../../domain/ports/site-arrival-orders.reader.js";
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
 * (`SiteArrivalOrdersReader`), pas celles du plan. Jusqu'au 2026-10-24, ce
 * service lisait `DayOrdersSource.producibleFor` (`planWhere`, `placed` seul) :
 * après l'arrêt du plan, toutes les commandes sont `confirmed`, le site n'était
 * plus résolu, `arrivalBy` tombait à `null`, et la composition de l'arrêt,
 * « Proposer » et le placement au fil de l'eau posaient le transfert sans
 * fenêtre — parfois dans une tournée d'après-midi.
 *
 * ## Le transfert arrive à la plus tôt des heures de ce qu'il porte (H-D4)
 *
 * `arrivalBy` = la plus tôt de l'heure requise du point et des heures des
 * réassorts « pour demain » envoyés du jour (`PlacedResupplyArrivals`, que
 * le réassort publie). Un point SANS retrait mais avec un réassort daté a
 * donc une heure : celle que le point demande (`requiredArrivals`, la même
 * règle sans les créneaux de commandes), sinon celle du réassort. Un
 * réassort sans heure ne compte pas. L'échéance des commandes
 * (`SiteDeadlines.forDay`) n'en est pas changée.
 */
@Injectable()
export class CommerceTransferSites extends TransferSitesReader {
  constructor(
    private readonly orders: SiteArrivalOrdersReader,
    private readonly settings: SiteDaySettingsReader,
    private readonly deadlines: SiteDeadlines,
    private readonly resupplies: PlacedResupplyArrivals,
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
    const [pickups, settings, resupplyArrivals] = await Promise.all([
      this.orders.forDay(day),
      this.settings.forDay(day, siteIds),
      this.resupplies.earliestFor(day, siteIds),
    ]);
    const arrivals = await this.siteArrivals(day, pickups, resupplyArrivals);
    const facts = new Map<string, TransferSiteFacts>();
    for (const siteId of siteIds) {
      const site = settings.get(siteId);
      if (site === undefined) {
        continue;
      }
      facts.set(siteId, {
        siteId,
        label: site.label,
        gps: site.gps,
        mode: site.transferMode,
        arrivalBy:
          site.supply === "transfer"
            ? earliestOf([arrivals.get(siteId) ?? null, resupplyArrivals.get(siteId) ?? null])
            : null,
      });
    }
    return facts;
  }

  /**
   * L'heure que chaque point demande : par ses retraits du jour (la règle de
   * l'échéance), sinon — point sans retrait mais avec un réassort daté — par
   * ses horaires seuls.
   */
  private async siteArrivals(
    day: string,
    pickups: readonly SiteArrivalOrder[],
    resupplyArrivals: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, string | null>> {
    const deadlines = await this.deadlines.forDay(
      day,
      pickups.map(({ window, siteId }) => ({ fulfillmentMethod: "pickup", window, siteId })),
    );
    const arrivals = new Map<string, string | null>();
    for (const [siteId, deadline] of deadlines) {
      arrivals.set(siteId, deadline.supply === "transfer" ? deadline.arrivalBy : null);
    }
    const unresolved = [...resupplyArrivals.keys()].filter((siteId) => !deadlines.has(siteId));
    for (const [siteId, arrival] of await this.deadlines.requiredArrivals(day, unresolved)) {
      arrivals.set(siteId, arrival);
    }
    return arrivals;
  }
}

/** La plus tôt des heures `HH:MM` présentes, ou `null` sans aucune. */
function earliestOf(clocks: readonly (string | null)[]): string | null {
  const present = clocks.filter((clock): clock is string => clock !== null);
  return present.length === 0 ? null : present.reduce((a, b) => (b < a ? b : a));
}
