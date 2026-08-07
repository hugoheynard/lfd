import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { OnCompanyActivated } from "./application/handlers/on-company-activated.handler.js";
import { OnCompanyDeclared } from "./application/handlers/on-company-declared.handler.js";
import { OnCompanyStepReached } from "./application/handlers/on-company-step-reached.handler.js";
import { OnOrderPlaced } from "./application/handlers/on-order-placed.handler.js";
import { OnSubscriptionCreated } from "./application/handlers/on-subscription-created.handler.js";
import { OnUserRegistered } from "./application/handlers/on-user-registered.handler.js";
import { ListActivationsHandler } from "./application/queries/list-activations.handler.js";
import { ListProspectsHandler } from "./application/queries/list-prospects.handler.js";
import { ActivationReader } from "./domain/ports/activation.reader.js";
import { ActivityRecorder } from "./domain/ports/activity-recorder.js";
import { ProspectReader } from "./domain/ports/prospect.reader.js";
import { AdminActivationsController } from "./http/admin-activations.controller.js";
import { AdminProspectsController } from "./http/admin-prospects.controller.js";
import { PrismaActivationReader } from "./infrastructure/prisma-activation.reader.js";
import { PrismaActivityRecorder } from "./infrastructure/prisma-activity-recorder.js";
import { PrismaProspectReader } from "./infrastructure/prisma-prospect.reader.js";

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
  controllers: [AdminProspectsController, AdminActivationsController],
  providers: [
    { provide: ActivityRecorder, useClass: PrismaActivityRecorder },
    { provide: ProspectReader, useClass: PrismaProspectReader },
    { provide: ActivationReader, useClass: PrismaActivationReader },
    ListProspectsHandler,
    ListActivationsHandler,
    OnOrderPlaced,
    OnCompanyDeclared,
    OnCompanyActivated,
    OnCompanyStepReached,
    OnSubscriptionCreated,
    OnUserRegistered,
  ],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
