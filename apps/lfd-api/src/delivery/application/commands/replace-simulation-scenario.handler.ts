import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { SimulationScenarioReplacedEvent } from "../../domain/events/simulation-scenario.events.js";
import { SimulationScenarioRepository } from "../../domain/ports/simulation-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensureScenarioNameFree, loadLiveScenario } from "../simulation-scenario-support.js";
import { ReplaceSimulationScenarioCommand } from "./replace-simulation-scenario.command.js";

/**
 * Remplace un scénario vivant — ce qui répare aussi un scénario qui ne se
 * relisait plus. Le fait dit l'ancien nom quand il change.
 *
 * @throws {SimulationScenarioNotFoundError} @throws {InvalidSimulationScenarioNameError}
 * @throws {SimulationScenarioNameTakenError}
 */
@CommandHandler(ReplaceSimulationScenarioCommand)
export class ReplaceSimulationScenarioHandler implements ICommandHandler<
  ReplaceSimulationScenarioCommand,
  void
> {
  constructor(
    private readonly scenarios: SimulationScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReplaceSimulationScenarioCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const scenario = await loadLiveScenario(this.scenarios, command.scenarioId);
      const previousName = scenario.name;
      scenario.replace(command.payload.name, command.payload.scenario, this.clock.now(), author);
      await ensureScenarioNameFree(this.scenarios, scenario);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new SimulationScenarioReplacedEvent(scenario, previousName));
    });
  }
}
