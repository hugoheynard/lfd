import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { OnOrderPlaced } from "./application/handlers/on-order-placed.handler.js";
import { ActivityRecorder } from "./domain/ports/activity-recorder.js";
import { PrismaActivityRecorder } from "./infrastructure/prisma-activity-recorder.js";

/**
 * Module **croissance** (`growth/`) — cross-domain. Il héberge le **journal
 * d'événements** (`ActivityRecorder`) et ses **abonnés** (`@EventsHandler`) qui
 * mappent les événements de domaine des autres contextes → lignes de journal.
 *
 * Il ne dépend d'AUCUNE table ni agrégat voisin : uniquement des **classes
 * d'événements** (le contrat) + les fondations (`Clock`, `IdGenerator`,
 * RequestContext), déjà globales. `CqrsModule` branche la découverte des abonnés.
 */
@Module({
  imports: [CqrsModule],
  providers: [{ provide: ActivityRecorder, useClass: PrismaActivityRecorder }, OnOrderPlaced],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
