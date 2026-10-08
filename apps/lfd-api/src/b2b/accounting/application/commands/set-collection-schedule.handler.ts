import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionScheduleChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetCollectionScheduleCommand } from "./legal-entity-commands.js";

/**
 * Règle le calendrier de prélèvement de l'entité.
 *
 * Les bornes et la règle « N ≥ délai de pré-notification » sont dans
 * l'agrégat ; ce handler charge, appelle, sauve, et journalise — seulement si
 * quelque chose a changé : une saisie rejouée n'est pas un fait.
 *
 * Un lot déjà constitué a FIGÉ son échéance : le changer ici ne le touche pas
 * (plan `plan-prelevement-automatique.md`, PA1 — annuler et reconstituer).
 */
@CommandHandler(SetCollectionScheduleCommand)
export class SetCollectionScheduleHandler implements ICommandHandler<
  SetCollectionScheduleCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCollectionScheduleCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    const { payload } = command;
    const changed = entity.setCollectionSchedule({
      delayHours: payload.delayHours,
      daysAfterClosure: payload.daysAfterClosure,
      depositCutoff: payload.depositCutoff,
    });
    if (!changed) {
      return;
    }
    const at = this.clock.now();
    const schedule = entity.collectionSchedule;
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new CollectionScheduleChangedEvent({ id: entity.id, name: entity.name }, at, {
          delayHours: schedule.delayHours,
          daysAfterClosure: schedule.daysAfterClosure,
          depositCutoffBusinessDays: schedule.depositCutoff?.businessDaysBefore ?? null,
          depositCutoffTime: schedule.depositCutoff?.time ?? null,
        }),
      );
    });
  }
}
