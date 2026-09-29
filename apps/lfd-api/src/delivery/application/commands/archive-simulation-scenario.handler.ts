import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { SimulationScenarioNotFoundError } from "../../domain/errors/delivery-simulation-errors.js";
import { SimulationScenarioArchivedEvent } from "../../domain/events/simulation-scenario.events.js";
import { SimulationScenarioRepository } from "../../domain/ports/simulation-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ArchiveSimulationScenarioCommand } from "./archive-simulation-scenario.command.js";

/**
 * Archive un scénario — jamais de suppression (`CLAUDE.md` §3). Un scénario
 * illisible s'archive quand même : c'est la sortie que son refus propose.
 *
 * @throws {SimulationScenarioNotFoundError} @throws {SimulationScenarioAlreadyArchivedError}
 */
@CommandHandler(ArchiveSimulationScenarioCommand)
export class ArchiveSimulationScenarioHandler implements ICommandHandler<
  ArchiveSimulationScenarioCommand,
  void
> {
  constructor(
    private readonly scenarios: SimulationScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveSimulationScenarioCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    await this.uow.run(async () => {
      const scenario = await this.scenarios.load(command.scenarioId);
      if (scenario === null) {
        throw new SimulationScenarioNotFoundError(command.scenarioId);
      }
      scenario.archive(this.clock.now(), author);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new SimulationScenarioArchivedEvent(scenario));
    });
  }
}
