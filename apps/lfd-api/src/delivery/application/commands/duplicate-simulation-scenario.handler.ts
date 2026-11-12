import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { SimulationScenarioDuplicatedEvent } from "../../domain/events/simulation-scenario.events.js";
import { SimulationScenarioRepository } from "../../domain/ports/simulation-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { freeCopyName, loadLiveScenario } from "../simulation-scenario-support.js";
import { DuplicateSimulationScenarioCommand } from "./duplicate-simulation-scenario.command.js";

/**
 * Un scénario neuf au même contenu, sous le premier nom de copie libre
 * (« X (copie) », « X (copie 2) »…). Un scénario illisible ne se duplique
 * pas : on recopierait une panne.
 *
 * **Une fois par intention** : chaque copie prend un nom neuf, rien ne
 * refuserait la seconde d'un double clic. La clé de l'écran est scellée avec
 * la copie ; un rejeu de la même clé rend la même copie.
 *
 * @throws {SimulationScenarioNotFoundError} @throws {SimulationScenarioUnreadableError}
 * @throws {SimulationScenarioNameTakenError}
 */
@CommandHandler(DuplicateSimulationScenarioCommand)
export class DuplicateSimulationScenarioHandler implements ICommandHandler<
  DuplicateSimulationScenarioCommand,
  string
> {
  constructor(
    private readonly scenarios: SimulationScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DuplicateSimulationScenarioCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "delivery.simulation.duplicate",
        subject: command.scenarioId,
      },
      CREATED_ID_REPLAY,
      (seal) => this.duplicate(command, seal),
    );
  }

  private async duplicate(
    command: DuplicateSimulationScenarioCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const author = await deliveryAuthorOf(this.directory, command.staffUserId);
    return this.uow.run(async () => {
      const source = await loadLiveScenario(this.scenarios, command.scenarioId);
      const copy = source.duplicate({
        id: this.ids.next(),
        name: await freeCopyName(this.scenarios, source.name),
        at: this.clock.now(),
        author,
      });
      await this.scenarios.save(copy);
      await this.events.publishTraced(new SimulationScenarioDuplicatedEvent(copy, source));
      await seal(copy.id);
      return copy.id;
    });
  }
}
