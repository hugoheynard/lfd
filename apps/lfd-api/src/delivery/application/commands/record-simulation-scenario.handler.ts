import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { SimulationScenario } from "../../domain/entities/simulation-scenario.js";
import { SimulationScenarioCreatedEvent } from "../../domain/events/simulation-scenario.events.js";
import { SimulationScenarioRepository } from "../../domain/ports/simulation-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureScenarioNameFree } from "../simulation-scenario-support.js";
import { RecordSimulationScenarioCommand } from "./record-simulation-scenario.command.js";

/**
 * Un scénario entre dans la liste, sous un nom libre. L'écriture et sa trace
 * partent ensemble.
 *
 * @throws {InvalidSimulationScenarioNameError} @throws {SimulationScenarioNameTakenError}
 */
@CommandHandler(RecordSimulationScenarioCommand)
export class RecordSimulationScenarioHandler implements ICommandHandler<
  RecordSimulationScenarioCommand,
  string
> {
  constructor(
    private readonly scenarios: SimulationScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordSimulationScenarioCommand): Promise<string> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    const scenario = SimulationScenario.record({
      id: this.ids.next(),
      name: command.payload.name,
      scenario: command.payload.scenario,
      at: this.clock.now(),
      author,
    });
    await this.uow.run(async () => {
      await ensureScenarioNameFree(this.scenarios, scenario);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new SimulationScenarioCreatedEvent(scenario));
    });
    return scenario.id;
  }
}
