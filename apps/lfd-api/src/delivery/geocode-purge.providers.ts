import type { Provider, Type } from "@nestjs/common";

import { PurgeStaleGeocodesHandler } from "./application/commands/purge-stale-geocodes.handler.js";
import { GeocodeCachePruner } from "./domain/ports/geocode-cache.pruner.js";
import { GeocodePurgeSweepController } from "./http/geocode-purge-sweep.controller.js";
import { PrismaGeocodeCachePruner } from "./infrastructure/prisma-geocode-cache.pruner.js";

/**
 * **La purge du cache du géocodage** (`documentation/legal/rgpd-purge-du-geocodage.md`),
 * rangée à part pour que `delivery.module.ts` ne grossisse pas : une route
 * machine, un handler, un port et son adaptateur.
 */
export const GEOCODE_PURGE_CONTROLLERS: readonly Type[] = [GeocodePurgeSweepController];

export const GEOCODE_PURGE_PROVIDERS: readonly Provider[] = [
  PurgeStaleGeocodesHandler,
  { provide: GeocodeCachePruner, useClass: PrismaGeocodeCachePruner },
];
