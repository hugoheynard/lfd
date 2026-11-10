import type { GpsPoint } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  DepartureSiteReader,
  RoadTravelTimeReader,
} from "../../../../delivery/channels/commerce/index.js";
import {
  type SiteDaySettings,
  SiteDaySettingsReader,
} from "../../domain/ports/site-day-settings.reader.js";
import type { DeadlineOrder, DeadlineSite } from "../../domain/services/deadline-thresholds.js";
import { type ClockWindow, transferDeparture } from "../../domain/services/transfer-departure.js";

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
 * transfert : le départ et l'arrivée requis (`transferDeparture`), depuis ses
 * créneaux du jour, sa mise en place, et le trajet routier entre le départ des
 * tournées et lui — tous deux lus à la livraison, qui les déclare et les
 * implémente (`DepartureSiteReader`, `RoadTravelTimeReader`).
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
  ) {}

  /**
   * Le site résolu, par id. Un id ABSENT du résultat (site inconnu, commande
   * sans site) se lit « non résolu » : l'échéance reste celle d'avant les sites.
   */
  async forDay(
    day: string,
    orders: readonly SitedOrder[],
  ): Promise<ReadonlyMap<string, DeadlineSite>> {
    const pickups = orders.filter((order) => order.fulfillmentMethod === "pickup");
    const ids = [
      ...new Set(pickups.flatMap((order) => (order.siteId === null ? [] : [order.siteId]))),
    ];
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
      resolved.set(id, await this.resolve(day, id, site, origin, windows));
    }
    return resolved;
  }

  private async resolve(
    day: string,
    id: string,
    site: SiteDaySettings,
    origin: GpsPoint | null,
    orderWindows: readonly ClockWindow[],
  ): Promise<DeadlineSite> {
    if (site.supply === "on_site") {
      return { supply: "on_site", counterSetupMinutes: site.counterSetupMinutes };
    }
    const travelMinutes =
      origin === null || site.gps === null
        ? null
        : await this.road.minutesBetween(origin, site.gps);
    const departure = transferDeparture({
      proPickup: site.proPickup,
      publicRules: site.publicRules,
      publicClosures: site.publicClosures,
      orderWindows,
      counterSetupMinutes: site.counterSetupMinutes,
      travelMinutes,
    });
    if (departure === null) {
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
  return "aucun créneau, aucune ouverture pros ni aucune commande avec une heure ce jour-là";
}
