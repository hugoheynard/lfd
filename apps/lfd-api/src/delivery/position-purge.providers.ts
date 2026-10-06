import type { Provider, Type } from "@nestjs/common";

import { PurgeStalePositionsHandler } from "./application/commands/purge-stale-positions.handler.js";
import { GesturePositionPruner } from "./domain/ports/gesture-position.pruner.js";
import { PositionPurgeSweepController } from "./http/position-purge-sweep.controller.js";
import { PrismaGesturePositionPruner } from "./infrastructure/prisma-gesture-position.pruner.js";

/**
 * **La purge des positions au geste** (`documentation/livraisons/gps-y-aller-et-position.md`),
 * rangée à part comme celle du géocodage : une route machine, un handler, un
 * port et son adaptateur.
 */
export const POSITION_PURGE_CONTROLLERS: readonly Type[] = [PositionPurgeSweepController];

export const POSITION_PURGE_PROVIDERS: readonly Provider[] = [
  PurgeStalePositionsHandler,
  { provide: GesturePositionPruner, useClass: PrismaGesturePositionPruner },
];
