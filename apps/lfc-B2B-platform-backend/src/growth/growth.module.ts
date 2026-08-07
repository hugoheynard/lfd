import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { OnCompanyActivated } from "./application/handlers/on-company-activated.handler.js";
import { OnCompanyDeclared } from "./application/handlers/on-company-declared.handler.js";
import { OnOrderPlaced } from "./application/handlers/on-order-placed.handler.js";
import { OnSubscriptionCreated } from "./application/handlers/on-subscription-created.handler.js";
import { OnUserRegistered } from "./application/handlers/on-user-registered.handler.js";
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
  providers: [
    { provide: ActivityRecorder, useClass: PrismaActivityRecorder },
    OnOrderPlaced,
    OnCompanyDeclared,
    OnCompanyActivated,
    OnSubscriptionCreated,
    OnUserRegistered,
  ],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
