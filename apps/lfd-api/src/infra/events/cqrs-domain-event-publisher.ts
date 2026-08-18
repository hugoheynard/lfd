import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";

import { DomainEventPublisher } from "./domain-event-publisher.js";

/**
 * Adaptateur de production : délègue au `EventBus` de `@nestjs/cqrs`, qui route
 * l'événement vers les `@EventsHandler` enregistrés (le journal `growth/`, et
 * demain d'autres consommateurs). Aucune logique — un simple pont.
 */
@Injectable()
export class CqrsDomainEventPublisher extends DomainEventPublisher {
  constructor(private readonly eventBus: EventBus) {
    super();
  }

  publish(event: object): void {
    this.eventBus.publish(event);
  }
}
