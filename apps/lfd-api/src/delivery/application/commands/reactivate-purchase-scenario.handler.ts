import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseScenarioReactivatedEvent } from "../../domain/events/purchase-scenario.events.js";
import { PurchaseScenarioRepository } from "../../domain/ports/purchase-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import {
  ensurePurchaseScenarioNameFree,
  loadPurchaseScenario,
} from "../purchase-scenario-support.js";
import { ReactivatePurchaseScenarioCommand } from "./reactivate-purchase-scenario.command.js";

/**
 * Réactive un scénario archivé, sous son nom — refusé si un autre scénario en
 * cours l'a pris entre-temps : on renomme l'un des deux d'abord.
 *
 * @throws {PurchaseScenarioNotFoundError} @throws {PurchaseScenarioNotArchivedError}
 * @throws {PurchaseScenarioNameTakenError}
 */
@CommandHandler(ReactivatePurchaseScenarioCommand)
export class ReactivatePurchaseScenarioHandler implements ICommandHandler<
  ReactivatePurchaseScenarioCommand,
  void
> {
  constructor(
    private readonly scenarios: PurchaseScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ scenarioId, staffUserId }: ReactivatePurchaseScenarioCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, staffUserId);
    await this.uow.run(async () => {
      const scenario = await loadPurchaseScenario(this.scenarios, scenarioId);
      scenario.reactivate(this.clock.now(), author);
      await ensurePurchaseScenarioNameFree(this.scenarios, scenario);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new PurchaseScenarioReactivatedEvent(scenario));
    });
  }
}
