import { Module } from "@nestjs/common";

import { ProductionDayModule } from "../day/production-day.module.js";
import { LaunchResupplyHandler } from "./application/commands/launch-resupply.handler.js";
import { GetDayResuppliesHandler } from "./application/queries/get-day-resupplies.handler.js";
import { ProductionLaunchedResupplies } from "./application/services/production-launched-resupplies.js";
import { ResupplyLaunchGestures } from "./application/services/resupply-launch-gesture.js";
import { ResupplyLaunchReading } from "./application/services/resupply-launch-reading.js";
import { ResupplyLaunchRecording } from "./application/services/resupply-launch-recording.js";
import { ProductionDayResuppliesController } from "./http/production-day-resupplies.controller.js";
import { ProductionResupplyLaunchController } from "./http/production-resupply-launch.controller.js";

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
    ResupplyLaunchGestures,
    ResupplyLaunchReading,
    ResupplyLaunchRecording,
    ProductionLaunchedResupplies,
  ],
  exports: [ProductionLaunchedResupplies],
})
export class ProductionResupplyModule {}

/**
 * Les fournisseurs que ce module exporte et que la racine de composition
 * (`appBootstrap/`) relie à un port d'un autre bloc : elle les prend ici,
 * jamais dans l'intérieur du métier.
 */
export { ProductionLaunchedResupplies };
