import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseScenarioReplacedEvent } from "../../domain/events/purchase-scenario.events.js";
import { PurchaseScenarioRepository } from "../../domain/ports/purchase-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import {
  ensurePurchaseScenarioNameFree,
  loadPurchaseScenario,
} from "../purchase-scenario-support.js";
import { ReplacePurchaseScenarioCommand } from "./replace-purchase-scenario.command.js";

/**
 * Remplace un scénario en cours — ce qui répare aussi un scénario qui ne se
 * relisait plus, ou dont on a retiré les éléments archivés. Le fait dit
 * l'ancien nom quand il change.
 *
 * @throws {PurchaseScenarioNotFoundError} @throws {PurchaseScenarioAlreadyArchivedError}
 * @throws {InvalidPurchaseScenarioNameError} @throws {InvalidBinGapError}
 * @throws {PurchaseScenarioNameTakenError}
 */
@CommandHandler(ReplacePurchaseScenarioCommand)
export class ReplacePurchaseScenarioHandler implements ICommandHandler<
  ReplacePurchaseScenarioCommand,
  void
> {
  constructor(
    private readonly scenarios: PurchaseScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({
    scenarioId,
    payload,
    staffUserId,
  }: ReplacePurchaseScenarioCommand): Promise<void> {
    const author = await deliveryAuthorOf(this.directory, staffUserId);
    await this.uow.run(async () => {
      const scenario = await loadPurchaseScenario(this.scenarios, scenarioId);
      const previousName = scenario.name;
      scenario.replace(
        payload.name,
        { selection: payload.selection, display: payload.display },
        this.clock.now(),
        author,
      );
      await ensurePurchaseScenarioNameFree(this.scenarios, scenario);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new PurchaseScenarioReplacedEvent(scenario, previousName));
    });
  }
}
