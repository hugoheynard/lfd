import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseScenarioArchivedEvent } from "../../domain/events/purchase-scenario.events.js";
import { PurchaseScenarioRepository } from "../../domain/ports/purchase-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { loadPurchaseScenario } from "../purchase-scenario-support.js";
import { ArchivePurchaseScenarioCommand } from "./archive-purchase-scenario.command.js";

/**
 * Archive un scénario d'achat — jamais de suppression (`CLAUDE.md` §3). Un
 * scénario illisible s'archive quand même : c'est une sortie que son refus propose.
 *
 * @throws {PurchaseScenarioNotFoundError} @throws {PurchaseScenarioAlreadyArchivedError}
 */
@CommandHandler(ArchivePurchaseScenarioCommand)
export class ArchivePurchaseScenarioHandler implements ICommandHandler<
  ArchivePurchaseScenarioCommand,
  void
> {
  constructor(
    private readonly scenarios: PurchaseScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ scenarioId, staffUserId }: ArchivePurchaseScenarioCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, staffUserId);
    await this.uow.run(async () => {
      const scenario = await loadPurchaseScenario(this.scenarios, scenarioId);
      scenario.archive(this.clock.now(), author);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new PurchaseScenarioArchivedEvent(scenario));
    });
  }
}
