import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Event } from "../../domain/entities/event.js";
import { EventRepository } from "../../domain/ports/event.repository.js";
import {
  EVENT_APPLICATIONS,
  EventApplications,
} from "../../domain/value-objects/event-applications.js";
import { EventDate } from "../../domain/value-objects/event-date.js";
import { EventName } from "../../domain/value-objects/event-name.js";
import { DeclareEventCommand } from "./declare-event.command.js";

/**
 * **Créer un événement** — rend son identifiant.
 *
 * Il concerne toutes les applications connues, `lafoliecoffee` seule
 * aujourd'hui : l'écran ne les choisit pas encore.
 *
 * @sans-journal le bloc des événements n'a pas de journal : l'auteur est gardé
 * sur la ligne (`created_by`), et un événement ne porte ni argent ni accès.
 */
@CommandHandler(DeclareEventCommand)
export class DeclareEventHandler implements ICommandHandler<DeclareEventCommand, string> {
  constructor(
    private readonly events: EventRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DeclareEventCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "events.event.declare",
        subject: intentSubject("event", command.name, command.date),
      },
      CREATED_ID_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private async declare(
    command: DeclareEventCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const event = Event.declare({
      id: this.ids.next(),
      name: EventName.of(command.name),
      date: EventDate.fromString(command.date),
      applications: EventApplications.of(EVENT_APPLICATIONS),
      createdBy: command.staffUserId,
      at: this.clock.now(),
    });
    await this.uow.run(async () => {
      await this.events.save(event);
      await seal(event.id);
    });
    return event.id;
  }
}
