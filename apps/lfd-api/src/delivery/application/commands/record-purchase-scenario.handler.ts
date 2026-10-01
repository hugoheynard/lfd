import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PurchaseScenario } from "../../domain/entities/purchase-scenario.js";
import { PurchaseScenarioCreatedEvent } from "../../domain/events/purchase-scenario.events.js";
import { PurchaseScenarioRepository } from "../../domain/ports/purchase-scenario.repository.js";
import { deliveryAuthorOf } from "../delivery-author.js";
import { ensurePurchaseScenarioNameFree } from "../purchase-scenario-support.js";
import { RecordPurchaseScenarioCommand } from "./record-purchase-scenario.command.js";

/**
 * Un scénario d'achat entre dans la liste, sous un nom libre. Les éléments
 * cités ne sont pas relus : un scénario garde ce qu'on a choisi, et la
 * relecture nommera ce qui aura disparu. L'écriture et sa trace partent ensemble.
 *
 * @throws {InvalidPurchaseScenarioNameError} @throws {InvalidBinGapError}
 * @throws {PurchaseScenarioNameTakenError}
 */
@CommandHandler(RecordPurchaseScenarioCommand)
export class RecordPurchaseScenarioHandler implements ICommandHandler<
  RecordPurchaseScenarioCommand,
  string
> {
  constructor(
    private readonly scenarios: PurchaseScenarioRepository,
    private readonly directory: StaffAuthorDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ payload, staffUserId }: RecordPurchaseScenarioCommand): Promise<string> {
    const author = await deliveryAuthorOf(this.directory, staffUserId);
    const scenario = PurchaseScenario.record({
      id: this.ids.next(),
      name: payload.name,
      content: { selection: payload.selection, display: payload.display },
      at: this.clock.now(),
      author,
    });
    await this.uow.run(async () => {
      await ensurePurchaseScenarioNameFree(this.scenarios, scenario);
      await this.scenarios.save(scenario);
      await this.events.publishTraced(new PurchaseScenarioCreatedEvent(scenario));
    });
    return scenario.id;
  }
}
