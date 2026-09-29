import type { DeliverySimulationScenarioSummaryView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { SimulationScenarioReader } from "../../domain/ports/simulation-scenario.reader.js";
import { ListSimulationScenariosQuery } from "./list-simulation-scenarios.query.js";

/** La liste de l'onglet Simulateur — visible de toute l'équipe qui lit les tournées. */
@QueryHandler(ListSimulationScenariosQuery)
export class ListSimulationScenariosHandler implements IQueryHandler<
  ListSimulationScenariosQuery,
  readonly DeliverySimulationScenarioSummaryView[]
> {
  constructor(private readonly reader: SimulationScenarioReader) {}

  execute(): Promise<readonly DeliverySimulationScenarioSummaryView[]> {
    return this.reader.list();
  }
}
