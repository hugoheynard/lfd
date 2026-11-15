import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
import { LaunchResupplyHandler } from "./application/commands/launch-resupply.handler.js";
import { GetDayResuppliesHandler } from "./application/queries/get-day-resupplies.handler.js";
import { ProductionLaunchedResupplies } from "./application/services/production-launched-resupplies.js";
import { ResupplyLaunchGestures } from "./application/services/resupply-launch-gesture.js";
import { ResupplyLaunchReading } from "./application/services/resupply-launch-reading.js";
import { ResupplyLaunchRecording } from "./application/services/resupply-launch-recording.js";
import { LaunchedResupplyLookup } from "./domain/ports/launched-resupply.lookup.js";
import { ProductionDayResuppliesController } from "./http/production-day-resupplies.controller.js";
import { ProductionResupplyLaunchController } from "./http/production-resupply-launch.controller.js";
import { PrismaLaunchedResupplyLookup } from "./infrastructure/prisma-launched-resupply.lookup.js";

/**
 * **Le réassort au plus tôt** (`reassort-boutiques/au-plus-tot.md`) : le lancer,
 * le lire, et le refus synchrone d'annuler un réassort lancé, que la racine de
 * composition relie au commerce (`ProductionDeskFeedModule`).
 */
@Module({
  imports: [ProductionDayModule],
  controllers: [ProductionDayResuppliesController, ProductionResupplyLaunchController],
  providers: [
    LaunchResupplyHandler,
    GetDayResuppliesHandler,
    // Un réassort lancé seul : une lecture ciblée, à part du dépôt de la journée (ISP).
    { provide: LaunchedResupplyLookup, useClass: PrismaLaunchedResupplyLookup },
    ResupplyLaunchGestures,
    ResupplyLaunchReading,
    ResupplyLaunchRecording,
    ProductionLaunchedResupplies,
  ],
  exports: [ProductionLaunchedResupplies],
})
export class ProductionResupplyModule {}
