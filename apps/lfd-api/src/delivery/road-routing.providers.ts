import type { Provider } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { DistanceMatrix } from "./domain/ports/distance-matrix.js";
import { Geocoder } from "./domain/ports/geocoder.js";
import { RouteGeometry } from "./domain/ports/route-geometry.js";
import { BanGeocoder } from "./infrastructure/ban-geocoder.js";
import { DisabledGeocoder } from "./infrastructure/disabled-geocoder.js";
import {
  DisabledDistanceMatrix,
  DisabledRouteGeometry,
} from "./infrastructure/disabled-road-routing.js";
import { OsrmDistanceMatrix } from "./infrastructure/osrm-distance-matrix.js";
import { OsrmRouteGeometry } from "./infrastructure/osrm-route-geometry.js";

/**
 * **Les adaptateurs sortants choisis par la configuration** — calcul routier,
 * tracé, géocodage. Rangés à part parce qu'ils sont les seuls du module à
 * dépendre d'`AppConfig` : chacun bascule sur sa version désactivée quand
 * l'adresse manque, et cette bascule se lit d'un bloc.
 */
export const ROAD_ROUTING_PROVIDERS: readonly Provider[] = [
  // Sans adresse (ou, en production, sans jeton ni https — L8b-C4), le calcul
  // routier REFUSE (L10b-C5) : plus de vol d'oiseau.
  {
    provide: DistanceMatrix,
    inject: [AppConfig],
    useFactory: (config: AppConfig): DistanceMatrix => {
      const endpoint = config.routePlannerEndpoint();
      return endpoint === null ? new DisabledDistanceMatrix() : new OsrmDistanceMatrix(endpoint);
    },
  },
  // Sans URL, pas de tracé : la carte montre les repères seuls (L10b-C4).
  {
    provide: RouteGeometry,
    inject: [AppConfig],
    useFactory: (config: AppConfig): RouteGeometry => {
      const endpoint = config.routePlannerEndpoint();
      return endpoint === null ? new DisabledRouteGeometry() : new OsrmRouteGeometry(endpoint);
    },
  },
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
