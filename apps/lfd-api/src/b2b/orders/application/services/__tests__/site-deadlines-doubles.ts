import type { GpsPoint } from "@lfd/contracts";

import {
  DepartureSiteReader,
  RoadTravelTimeReader,
} from "../../../../../delivery/channels/commerce/index.js";
import {
  type SiteDaySettings,
  SiteDaySettingsReader,
} from "../../../domain/ports/site-day-settings.reader.js";
import { SiteDeadlines } from "../site-deadlines.service.js";

/** Les réglages d'un site pour un jour — sur place, sans heure, par défaut. */
export function siteSettings(over: Partial<SiteDaySettings> = {}): SiteDaySettings {
  return {
    label: "Site",
    supply: "on_site",
    transferMode: "integrated",
    counterSetupMinutes: 0,
    gps: null,
    proPickup: null,
    publicRules: [],
    publicClosures: [],
    ...over,
  };
}

export const FOURNIL_GPS: GpsPoint = { lat: 45.45, lng: 6.97 };
export const VILLAGE_GPS: GpsPoint = { lat: 45.5, lng: 6.9 };

/** Des sites fixes ; note chaque demande. Un id inconnu est absent, comme en base. */
export class FixedSiteSettings extends SiteDaySettingsReader {
  readonly asked: { readonly day: string; readonly ids: readonly string[] }[] = [];

  constructor(private readonly sites: ReadonlyMap<string, SiteDaySettings>) {
    super();
  }

  forDay(day: string, siteIds: readonly string[]): Promise<ReadonlyMap<string, SiteDaySettings>> {
    this.asked.push({ day, ids: siteIds });
    const found = new Map<string, SiteDaySettings>();
    for (const id of siteIds) {
      const site = this.sites.get(id);
      if (site !== undefined) {
        found.set(id, site);
      }
    }
    return Promise.resolve(found);
  }
}

export class FixedDeparture extends DepartureSiteReader {
  constructor(private readonly id: string | null) {
    super();
  }

  currentSiteId(): Promise<string | null> {
    return Promise.resolve(this.id);
  }
}

/** Un trajet fixe ; `null` = calcul routier indisponible. Note chaque trajet demandé. */
export class FixedRoad extends RoadTravelTimeReader {
  readonly asked: { readonly from: GpsPoint; readonly to: GpsPoint }[] = [];

  constructor(private readonly minutes: number | null) {
    super();
  }

  minutesBetween(from: GpsPoint, to: GpsPoint): Promise<number | null> {
    this.asked.push({ from, to });
    return Promise.resolve(this.minutes);
  }
}

/** Le service, branché sur ses trois doubles. */
export function siteDeadlinesOf(options: {
  readonly sites?: ReadonlyMap<string, SiteDaySettings>;
  readonly departureId?: string | null;
  readonly travelMinutes?: number | null;
}): {
  readonly service: SiteDeadlines;
  readonly sites: FixedSiteSettings;
  readonly road: FixedRoad;
} {
  const sites = new FixedSiteSettings(options.sites ?? new Map());
  const road = new FixedRoad(options.travelMinutes === undefined ? 30 : options.travelMinutes);
  const departure = new FixedDeparture(
    options.departureId === undefined ? "site_fournil" : options.departureId,
  );
  return { service: new SiteDeadlines(sites, departure, road), sites, road };
}
