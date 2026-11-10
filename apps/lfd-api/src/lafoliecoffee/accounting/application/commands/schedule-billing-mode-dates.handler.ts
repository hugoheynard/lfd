import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesChangedEvent } from "../../domain/events/billing-mode.events.js";
import { BillingModeDatesRepository } from "../../domain/ports/billing-mode-dates.repository.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { billingModeOf } from "../../domain/value-objects/billing-mode.js";
import { loadOrFail } from "../legal-entity-support.js";
import { ScheduleBillingModeDatesCommand } from "./schedule-billing-mode-dates.command.js";

/**
 * Programme les dates d'un mode. La prise d'effet — la prochaine clôture du
 * mode — et la règle « un seul changement à la fois, au temps » sont tenues
 * par l'historique (`BillingModeDatesHistory.schedule`). Une saisie égale aux
 * dates en vigueur n'est pas un fait : rien ne s'écrit.
 */
@CommandHandler(ScheduleBillingModeDatesCommand)
export class ScheduleBillingModeDatesHandler implements ICommandHandler<
  ScheduleBillingModeDatesCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly dates: BillingModeDatesRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ScheduleBillingModeDatesCommand): Promise<void> {
    const mode = billingModeOf(command.mode);
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const history = await this.dates.load(entity.id, mode);
    const at = this.clock.now();
    const change = history.schedule(command.days, {
      segmentId: this.ids.next(),
      at,
      staffId: command.staffId,
    });
    if (change === null) {
      return;
    }
    await this.uow.run(async () => {
      await this.dates.save(history);
      await this.events.publishTraced(
        new BillingModeDatesChangedEvent({ id: entity.id, name: entity.name }, at, change),
      );
    });
  }
}
