import type { Provider, Type } from "@nestjs/common";

import { ArchiveSimulationScenarioHandler } from "./application/commands/archive-simulation-scenario.handler.js";
import { DuplicateSimulationScenarioHandler } from "./application/commands/duplicate-simulation-scenario.handler.js";
import { RecordSimulationScenarioHandler } from "./application/commands/record-simulation-scenario.handler.js";
import { ReplaceSimulationScenarioHandler } from "./application/commands/replace-simulation-scenario.handler.js";
import { GetSimulationFromDayHandler } from "./application/queries/get-simulation-from-day.handler.js";
import { GetSimulationScenarioHandler } from "./application/queries/get-simulation-scenario.handler.js";
import { ListSimulationScenariosHandler } from "./application/queries/list-simulation-scenarios.handler.js";
import { SimulationScenarioReader } from "./domain/ports/simulation-scenario.reader.js";
import { SimulationScenarioRepository } from "./domain/ports/simulation-scenario.repository.js";
import { DeliverySimulationScenariosController } from "./http/delivery-simulation-scenarios.controller.js";
import { PrismaSimulationScenarioReader } from "./infrastructure/prisma-simulation-scenario.reader.js";
import { PrismaSimulationScenarioRepository } from "./infrastructure/prisma-simulation-scenario.repository.js";

/**
 * **Les scénarios du simulateur** — enregistrer, remplacer, dupliquer,
 * archiver, relire : rangés à part pour que `delivery.module.ts` reste lisible.
 */
export const SIMULATION_SCENARIOS_CONTROLLERS: readonly Type[] = [
  DeliverySimulationScenariosController,
];

export const SIMULATION_SCENARIOS_PROVIDERS: readonly Provider[] = [
  RecordSimulationScenarioHandler,
  ReplaceSimulationScenarioHandler,
  DuplicateSimulationScenarioHandler,
  ArchiveSimulationScenarioHandler,
  ListSimulationScenariosHandler,
  GetSimulationScenarioHandler,
  GetSimulationFromDayHandler,
  { provide: SimulationScenarioRepository, useClass: PrismaSimulationScenarioRepository },
  { provide: SimulationScenarioReader, useClass: PrismaSimulationScenarioReader },
];
