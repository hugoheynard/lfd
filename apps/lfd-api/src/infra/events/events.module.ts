import { Global, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { BackgroundWork } from "./background-work.js";
import { CqrsDomainEventPublisher } from "./cqrs-domain-event-publisher.js";
import { DomainEventPublisher } from "./domain-event-publisher.js";

/**
 * Fondation **cross-cutting** de la publication d'événements de domaine. `@Global`
 * → tout handler de commande injecte `DomainEventPublisher` sans ré-importer. Le
 * `EventBus` cqrs sous-jacent est un singleton d'app, donc les `@EventsHandler`
 * déclarés ailleurs (ex. `GrowthModule`) reçoivent les événements publiés ici.
 */
@Global()
@Module({
  imports: [CqrsModule],
  providers: [
    { provide: DomainEventPublisher, useClass: CqrsDomainEventPublisher },
    BackgroundWork,
  ],
  exports: [DomainEventPublisher, BackgroundWork],
})
export class EventsModule {}
