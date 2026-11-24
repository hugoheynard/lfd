import type { GpsPoint } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  DepartureSiteReader,
  RoadTravelTimeReader,
} from "../../../../delivery/channels/commerce/index.js";
import { PlacedResupplyArrivals } from "../../../resupply/domain/placed-resupply-arrivals.reader.js";
import {
  type SiteDaySettings,
  SiteDaySettingsReader,
} from "../../domain/ports/site-day-settings.reader.js";
import type { DeadlineOrder, DeadlineSite } from "../../domain/services/deadline-thresholds.js";
import {
  type ClockWindow,
  requiredArrival,
  transferDeparture,
} from "../../domain/services/transfer-departure.js";

/** Une commande du jour, réduite à ce qui désigne son site. */
export interface SitedOrder {
  readonly fulfillmentMethod: DeadlineOrder["fulfillmentMethod"];
  readonly window: ClockWindow | null;
  /** Figé à la passation (S2) ; `null` = livraison, ou commande d'avant le lot. */
  readonly siteId: string | null;
}

/**
 * **Le site résolu de chaque retrait d'un jour** — ce que l'échéance du
 * fournil et le snapshot du colisage lisent (plan du transfert interne, §7,
 * lot T0).
 *
 * Pour un site sur place : sa mise en place au comptoir. Pour un site servi par
 * transfert : l'arrivée et le départ requis (`transferDeparture`), depuis ses
 * créneaux du jour, sa mise en place, la plus tôt des heures de ses réassorts
 * « pour demain » envoyés (`PlacedResupplyArrivals`, une lecture groupée) et
 * le trajet routier entre le départ des tournées et lui — tous deux lus à la
 * livraison, qui les déclare et les implémente (`DepartureSiteReader`,
 * `RoadTravelTimeReader`).
 *
 * C'est le SEUL endroit où l'heure du point et celles des réassorts se
 * composent (règle de Hugo du 2026-11-24, la plus faible échéance) : le
 * compte à rebours, la copie du colisage et le placement du transfert lisent
 * tous cette arrivée.
 *
 * Calculé À LA VOLÉE, jamais rangé. L'arrêt du plan fige l'échéance de chaque
 * commande sur le bon du fournil (`production_order.due_at`, par
 * `SitedDayOrders`) ; mais le compte à rebours (`DueThresholds`) NE LIT PAS
 * cette colonne : il recalcule ici, avant comme après l'arrêt, sur les
 * commandes vivantes du jour (vérifié le 2026-10-24). Un site réglé autrement
 * après l'arrêt déplace donc le compte à rebours, pas le bon déjà figé.
 *
 * ## Une échéance qui passe sans heure : au LOG, pas au journal
 *
 * Ce service est appelé par des LECTURES — fiche d'atelier, compte à rebours,
 * arrêt — et une lecture n'écrit rien (CLAUDE.md §4) : un fait au journal à
 * chaque ouverture de la fiche serait une écriture, et un doublon par lecture.
 * Le départ incalculable est donc dit au log, avec sa raison, à chaque calcul.
 */
@Injectable()
export class SiteDeadlines {
  private readonly logger = new Logger("Échéance par site");

  constructor(
    private readonly sites: SiteDaySettingsReader,
    private readonly departure: DepartureSiteReader,
    private readonly road: RoadTravelTimeReader,
    private readonly resupplies: PlacedResupplyArrivals,
  ) {}

  /**
   * Le site résolu, par id : celui de chaque retrait, et celui de chaque
   * point de `alsoSiteIds` qui a un réassort daté ce jour-là (le placement
   * d'un transfert qui ne porte que des réassorts). Un id ABSENT du résultat
   * (site inconnu, commande sans site) se lit « non résolu » : l'échéance
   * reste celle d'avant les sites.
   */
  async forDay(
    day: string,
    orders: readonly SitedOrder[],
    alsoSiteIds: readonly string[] = [],
  ): Promise<ReadonlyMap<string, DeadlineSite>> {
    const pickups = orders.filter((order) => order.fulfillmentMethod === "pickup");
    const pickupIds = [
      ...new Set(pickups.flatMap((order) => (order.siteId === null ? [] : [order.siteId]))),
    ];
    const asked = [...new Set([...pickupIds, ...alsoSiteIds])];
    if (asked.length === 0) {
      return new Map();
    }
    const resupplyArrivals = await this.resupplies.earliestFor(day, asked);
    const ids = asked.filter((id) => pickupIds.includes(id) || resupplyArrivals.has(id));
    if (ids.length === 0) {
      return new Map();
    }
    const departureId = await this.departure.currentSiteId();
    const settings = await this.sites.forDay(
      day,
      departureId === null || ids.includes(departureId) ? ids : [...ids, departureId],
    );
    const origin = departureId === null ? null : (settings.get(departureId)?.gps ?? null);
    const resolved = new Map<string, DeadlineSite>();
    for (const id of ids) {
      const site = settings.get(id);
      if (site === undefined) {
        continue;
      }
      const windows = pickups.flatMap((order) =>
        order.siteId === id && order.window !== null ? [order.window] : [],
      );
      const timing = { origin, windows, resupplyArrival: resupplyArrivals.get(id) ?? null };
      resolved.set(id, await this.resolve(day, id, site, timing));
    }
    return resolved;
  }

  /**
   * L'heure d'arrivée requise de chaque point demandé, AVEC ou SANS retrait
   * ce jour-là (le réassort la propose, H-D3 du plan de l'heure du
   * réassort) : la même règle que {@link forDay} — ouverture pros ou premier
   * créneau public, moins la mise en place —, sans le repli sur les créneaux
   * des commandes, qu'un point sans commande n'a pas. Sans trajet : un point
   * servi sur place la tient aussi. Un point inconnu ou sans horaire ce
   * jour-là est ABSENT du résultat.
   */
  async requiredArrivals(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const settings = await this.sites.forDay(day, siteIds);
    const arrivals = new Map<string, string>();
    for (const [id, site] of settings) {
      const arrival = requiredArrival({ ...site, orderWindows: [] });
      if (arrival !== null) {
        arrivals.set(id, arrival);
      }
    }
    return arrivals;
  }

  private async resolve(
    day: string,
    id: string,
    site: SiteDaySettings,
    timing: SiteTiming,
  ): Promise<DeadlineSite> {
    if (site.supply === "on_site") {
      return { supply: "on_site", counterSetupMinutes: site.counterSetupMinutes };
    }
    const { origin } = timing;
    const travelMinutes =
      origin === null || site.gps === null
        ? null
        : await this.road.minutesBetween(origin, site.gps);
    const departure = transferDeparture({
      proPickup: site.proPickup,
      publicRules: site.publicRules,
      publicClosures: site.publicClosures,
      orderWindows: timing.windows,
      counterSetupMinutes: site.counterSetupMinutes,
      resupplyArrival: timing.resupplyArrival,
      travelMinutes,
    });
    if ((departure?.departureBy ?? null) === null) {
      this.logger.warn(
        `Transfert vers le site ${id} le ${day} : départ requis incalculable ` +
          `(${missingOf(site, origin, travelMinutes)}). Ses commandes passent « sans heure » ` +
          "au compte à rebours du fournil — régler le site en Réglages › Sites.",
      );
    }
    return {
      supply: "transfer",
      requiredBy: departure?.departureBy ?? null,
      arrivalBy: departure?.arrivalBy ?? null,
    };
  }
}

/** Ce qui fixe l'heure d'un point, hors de ses réglages. */
interface SiteTiming {
  /** Le point GPS du départ des tournées, ou `null`. */
  readonly origin: GpsPoint | null;
  readonly windows: readonly ClockWindow[];
  /** La plus tôt des heures de ses réassorts « pour demain », ou `null`. */
  readonly resupplyArrival: string | null;
}

/** La raison, dans les mots de l'écran des sites. */
function missingOf(
  site: SiteDaySettings,
  origin: GpsPoint | null,
  travelMinutes: number | null,
): string {
  if (origin === null) {
    return "le départ des tournées n'a pas de point GPS, ou aucun site ne livre";
  }
  if (site.gps === null) {
    return "le site n'a pas de point GPS";
  }
  if (travelMinutes === null) {
    return "le calcul routier est indisponible";
  }
  return "aucun créneau, aucune ouverture pros, aucune commande ni aucun réassort avec une heure ce jour-là";
}
