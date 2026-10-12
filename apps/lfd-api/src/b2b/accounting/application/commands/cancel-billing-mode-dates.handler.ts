import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesChangedEvent } from "../../domain/events/billing-mode.events.js";
import { BillingModeDatesRepository } from "../../domain/ports/billing-mode-dates.repository.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { billingModeOf } from "../../domain/value-objects/billing-mode.js";
import { loadOrFail } from "../legal-entity-support.js";
import { CancelBillingModeDatesCommand } from "./cancel-billing-mode-dates.command.js";

/**
 * Annule les dates programmées d'un mode. L'historique refuse quand rien
 * n'est programmé, ou quand la prise d'effet est atteinte : le passé ne
 * s'annule pas.
 */
@CommandHandler(CancelBillingModeDatesCommand)
export class CancelBillingModeDatesHandler implements ICommandHandler<
  CancelBillingModeDatesCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly dates: BillingModeDatesRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelBillingModeDatesCommand): Promise<void> {
    const mode = billingModeOf(command.mode);
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const history = await this.dates.load(entity.id, mode);
    const at = this.clock.now();
    const change = history.cancelScheduled({ at, staffId: command.staffId });
    await this.uow.run(async () => {
      await this.dates.save(history);
      await this.events.publishTraced(
        new BillingModeDatesChangedEvent({ id: entity.id, name: entity.name }, at, change),
      );
    });
  }
}
