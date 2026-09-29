import type { DeliverySimulationScenarioView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  SimulationScenarioNotFoundError,
  SimulationScenarioUnreadableError,
} from "../../domain/errors/delivery-simulation-errors.js";
import { SimulationScenarioReader } from "../../domain/ports/simulation-scenario.reader.js";
import { GetSimulationScenarioQuery } from "./get-simulation-scenario.query.js";

/**
 * Un scénario rouvert, revalidé à la relecture : s'il ne passe plus, le refus
 * le nomme et dit la sortie (409), jamais une 500.
 *
 * @throws {SimulationScenarioNotFoundError} @throws {SimulationScenarioUnreadableError}
 */
@QueryHandler(GetSimulationScenarioQuery)
export class GetSimulationScenarioHandler implements IQueryHandler<
  GetSimulationScenarioQuery,
  DeliverySimulationScenarioView
> {
  constructor(private readonly reader: SimulationScenarioReader) {}

  async execute({
    scenarioId,
  }: GetSimulationScenarioQuery): Promise<DeliverySimulationScenarioView> {
    const record = await this.reader.byId(scenarioId);
    if (record === null) {
      throw new SimulationScenarioNotFoundError(scenarioId);
    }
    if (!record.content.readable) {
      throw new SimulationScenarioUnreadableError(record.name, record.content.reason);
    }
    return {
      id: record.id,
      name: record.name,
      scenario: record.content.payload,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
