import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";

import { Journal } from "../journal/journal.js";
import type { JournaledEvent } from "../journal/journal-fact.js";
import { DomainEventPublisher } from "./domain-event-publisher.js";

/**
 * Adaptateur de production : délègue au `EventBus` de `@nestjs/cqrs`, qui route
 * l'événement vers les `@EventsHandler` enregistrés (le journal `growth/`, et
 * demain d'autres consommateurs). Aucune logique — un simple pont.
 */
@Injectable()
export class CqrsDomainEventPublisher extends DomainEventPublisher {
  constructor(
    private readonly eventBus: EventBus,
    private readonly journal: Journal,
  ) {
    super();
  }

  publish(event: object): void {
    this.eventBus.publish(event);
  }

  /**
   * Le journal D'ABORD, le bus ensuite — et l'ordre n'est pas cosmétique. Le
   * bus est best-effort et hors transaction ; s'il partait en premier, un abonné
   * pourrait réagir (un mail, une projection) à un fait que la transaction va
   * annuler une milliseconde plus tard.
   */
  async publishTraced(event: JournaledEvent): Promise<void> {
    await this.journal.append(event.journalFact());
    this.eventBus.publish(event);
  }
}
