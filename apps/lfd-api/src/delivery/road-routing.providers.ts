import type { Provider } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { WallClock } from "../platform/time/wall-clock.js";
import { WakeRoadRoutingHandler } from "./application/commands/wake-road-routing.handler.js";
import { DistanceMatrix } from "./domain/ports/distance-matrix.js";
import { Geocoder } from "./domain/ports/geocoder.js";
import { RoadRoutingWaker } from "./domain/ports/road-routing-waker.js";
import { RouteGeometry } from "./domain/ports/route-geometry.js";
import { BanGeocoder } from "./infrastructure/ban-geocoder.js";
import { DisabledGeocoder } from "./infrastructure/disabled-geocoder.js";
import {
  DisabledDistanceMatrix,
  DisabledRoadRoutingWaker,
  DisabledRouteGeometry,
} from "./infrastructure/disabled-road-routing.js";
import { OsrmDistanceMatrix } from "./infrastructure/osrm-distance-matrix.js";
import { wallClockPacing } from "./infrastructure/osrm-fetch.js";
import { OsrmRoadRoutingWaker } from "./infrastructure/osrm-road-routing-waker.js";
import { RoadRoutingWakeController } from "./http/road-routing-wake.controller.js";
import { OsrmRouteGeometry } from "./infrastructure/osrm-route-geometry.js";

/**
 * **Les adaptateurs sortants choisis par la configuration** — calcul routier,
 * tracé, géocodage. Rangés à part parce qu'ils sont les seuls du module à
 * dépendre d'`AppConfig` : chacun bascule sur sa version désactivée quand
 * l'adresse manque, et cette bascule se lit d'un bloc.
 */
/** La route du réveil (2026-11-01). */
export const ROAD_ROUTING_CONTROLLERS = [RoadRoutingWakeController];

export const ROAD_ROUTING_PROVIDERS: readonly Provider[] = [
  // Sans adresse (ou, en production, sans jeton ni https — L8b-C4), le calcul
  // routier REFUSE (L10b-C5) : plus de vol d'oiseau.
  {
    provide: DistanceMatrix,
    inject: [AppConfig, WallClock],
    useFactory: (config: AppConfig, wall: WallClock): DistanceMatrix => {
      const endpoint = config.routePlannerEndpoint();
      return endpoint === null
        ? new DisabledDistanceMatrix()
        : new OsrmDistanceMatrix(endpoint, wallClockPacing(wall));
    },
  },
  // Sans URL, pas de tracé : la carte montre les repères seuls (L10b-C4).
  {
    provide: RouteGeometry,
    inject: [AppConfig, WallClock],
    useFactory: (config: AppConfig, wall: WallClock): RouteGeometry => {
      const endpoint = config.routePlannerEndpoint();
      return endpoint === null
        ? new DisabledRouteGeometry()
        : new OsrmRouteGeometry(endpoint, wallClockPacing(wall));
    },
  },
  // Le réveil à l'ouverture du Tour manager (2026-11-01) : sans URL, rien à réveiller.
  {
    provide: RoadRoutingWaker,
    inject: [AppConfig, WallClock],
    useFactory: (config: AppConfig, wall: WallClock): RoadRoutingWaker => {
      const endpoint = config.routePlannerEndpoint();
      return endpoint === null
        ? new DisabledRoadRoutingWaker()
        : new OsrmRoadRoutingWaker(endpoint, wallClockPacing(wall));
    },
  },
  WakeRoadRoutingHandler,
  // Sans URL, le géocodage est DÉSACTIVÉ (L7-C9) : les e2e ne sortent pas sur le réseau.
  {
    provide: Geocoder,
    inject: [AppConfig],
    useFactory: (config: AppConfig): Geocoder => {
      const url = config.geocoderUrl();
      return url === null ? new DisabledGeocoder() : new BanGeocoder(url);
    },
  },
];
