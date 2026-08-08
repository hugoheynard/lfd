import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { RecomputeGuard } from "../infra/auth/recompute.guard.js";
import { AddMarketNafHandler } from "./application/commands/add-market-naf.handler.js";
import { AddMarketZoneHandler } from "./application/commands/add-market-zone.handler.js";
import { CaptureLeadHandler } from "./application/commands/capture-lead.handler.js";
import { ChangeLeadStatusHandler } from "./application/commands/change-lead-status.handler.js";
import { RecomputeLeadScoresHandler } from "./application/commands/recompute-lead-scores.handler.js";
import { RefreshMarketHandler } from "./application/commands/refresh-market.handler.js";
import { RemoveMarketNafHandler } from "./application/commands/remove-market-naf.handler.js";
import { RemoveMarketZoneHandler } from "./application/commands/remove-market-zone.handler.js";
import { OnCompanyActivated } from "./application/handlers/on-company-activated.handler.js";
import { OnCompanyDeclared } from "./application/handlers/on-company-declared.handler.js";
import { OnCompanyStepReached } from "./application/handlers/on-company-step-reached.handler.js";
import { OnOrderPlaced } from "./application/handlers/on-order-placed.handler.js";
import { OnSubscriptionCreated } from "./application/handlers/on-subscription-created.handler.js";
import { OnUserRegistered } from "./application/handlers/on-user-registered.handler.js";
import { OnUserRegisteredLinkLead } from "./application/handlers/on-user-registered-link-lead.handler.js";
import { GetCockpitHandler } from "./application/queries/get-cockpit.handler.js";
import { GetGrowthStatsHandler } from "./application/queries/get-growth-stats.handler.js";
import { GetMarketAdoptionHandler } from "./application/queries/get-market-adoption.handler.js";
import { GetMarketConfigHandler } from "./application/queries/get-market-config.handler.js";
import { GetTerminationStatsHandler } from "./application/queries/get-termination-stats.handler.js";
import { ListActivationsHandler } from "./application/queries/list-activations.handler.js";
import { ListLeadsHandler } from "./application/queries/list-leads.handler.js";
import { ListProspectsHandler } from "./application/queries/list-prospects.handler.js";
import { ActivationReader } from "./domain/ports/activation.reader.js";
import { ActivityRecorder } from "./domain/ports/activity-recorder.js";
import { GrowthStatsReader } from "./domain/ports/growth-stats.reader.js";
import { MarketAdoptionReader } from "./domain/ports/market-adoption.reader.js";
import { MarketConfigStore } from "./domain/ports/market-config.store.js";
import { TerminationStatsReader } from "./domain/ports/termination-stats.reader.js";
import { MarketDirectory } from "./domain/ports/market-directory.js";
import { LeadEventSource } from "./domain/ports/lead-event-source.js";
import { LeadReader } from "./domain/ports/lead.reader.js";
import { LeadRepository } from "./domain/ports/lead.repository.js";
import { LeadScoreReader } from "./domain/ports/lead-score.reader.js";
import { LeadScoreStore } from "./domain/ports/lead-score.store.js";
import { ProspectReader } from "./domain/ports/prospect.reader.js";
import { AdminActivationsController } from "./http/admin-activations.controller.js";
import { AdminCockpitController } from "./http/admin-cockpit.controller.js";
import { AdminGrowthController } from "./http/admin-growth.controller.js";
import { AdminLeadsController } from "./http/admin-leads.controller.js";
import { AdminMarketController } from "./http/admin-market.controller.js";
import { AdminProspectsController } from "./http/admin-prospects.controller.js";
import { AdminRecomputeController } from "./http/admin-recompute.controller.js";
import { PrismaActivationReader } from "./infrastructure/prisma-activation.reader.js";
import { PrismaActivityRecorder } from "./infrastructure/prisma-activity-recorder.js";
import { PrismaGrowthStatsReader } from "./infrastructure/prisma-growth-stats.reader.js";
import { PrismaLeadEventSource } from "./infrastructure/prisma-lead-event-source.js";
import { PrismaMarketAdoptionReader } from "./infrastructure/prisma-market-adoption.reader.js";
import { PrismaMarketConfigStore } from "./infrastructure/prisma-market-config.store.js";
import { PrismaTerminationStatsReader } from "./infrastructure/prisma-termination-stats.reader.js";
import { RechercheEntreprisesDirectory } from "./infrastructure/recherche-entreprises.directory.js";
import { PrismaLeadReader } from "./infrastructure/prisma-lead.reader.js";
import { PrismaLeadRepository } from "./infrastructure/prisma-lead.repository.js";
import { PrismaLeadScoreReader } from "./infrastructure/prisma-lead-score.reader.js";
import { PrismaLeadScoreStore } from "./infrastructure/prisma-lead-score.store.js";
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
  controllers: [
    AdminProspectsController,
    AdminActivationsController,
    AdminRecomputeController,
    AdminCockpitController,
    AdminLeadsController,
    AdminGrowthController,
    AdminMarketController,
  ],
  providers: [
    { provide: ActivityRecorder, useClass: PrismaActivityRecorder },
    { provide: ProspectReader, useClass: PrismaProspectReader },
    { provide: ActivationReader, useClass: PrismaActivationReader },
    { provide: LeadEventSource, useClass: PrismaLeadEventSource },
    { provide: LeadScoreStore, useClass: PrismaLeadScoreStore },
    { provide: LeadScoreReader, useClass: PrismaLeadScoreReader },
    { provide: LeadRepository, useClass: PrismaLeadRepository },
    { provide: LeadReader, useClass: PrismaLeadReader },
    { provide: GrowthStatsReader, useClass: PrismaGrowthStatsReader },
    { provide: MarketConfigStore, useClass: PrismaMarketConfigStore },
    { provide: MarketDirectory, useClass: RechercheEntreprisesDirectory },
    { provide: MarketAdoptionReader, useClass: PrismaMarketAdoptionReader },
    { provide: TerminationStatsReader, useClass: PrismaTerminationStatsReader },
    RecomputeGuard,
    RecomputeLeadScoresHandler,
    CaptureLeadHandler,
    ChangeLeadStatusHandler,
    GetCockpitHandler,
    GetGrowthStatsHandler,
    GetMarketConfigHandler,
    GetMarketAdoptionHandler,
    GetTerminationStatsHandler,
    AddMarketZoneHandler,
    RemoveMarketZoneHandler,
    AddMarketNafHandler,
    RemoveMarketNafHandler,
    RefreshMarketHandler,
    ListLeadsHandler,
    ListProspectsHandler,
    ListActivationsHandler,
    OnOrderPlaced,
    OnCompanyDeclared,
    OnCompanyActivated,
    OnCompanyStepReached,
    OnSubscriptionCreated,
    OnUserRegistered,
    OnUserRegisteredLinkLead,
  ],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
