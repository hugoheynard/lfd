import { Module } from "@nestjs/common";

import { RecomputeGuard } from "../../platform/auth/recompute.guard.js";
import { BookAppointmentHandler } from "./application/commands/book-appointment.handler.js";
import { CancelOwnAppointmentHandler } from "./application/commands/cancel-own-appointment.handler.js";
import { SaveAvailabilityExceptionsHandler } from "./application/commands/save-availability-exceptions.handler.js";
import { SaveAvailabilityHandler } from "./application/commands/save-availability.handler.js";
import { SaveBookingPolicyHandler } from "./application/commands/save-booking-policy.handler.js";
import { ScheduleAppointmentHandler } from "./application/commands/schedule-appointment.handler.js";
import { TransitionAppointmentHandler } from "./application/commands/transition-appointment.handler.js";
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
import {
  OnSupportHandled,
  OnSupportRequested,
} from "./application/handlers/on-support-activity.handler.js";
import { GetAppointmentHandler } from "./application/queries/get-appointment.handler.js";
import { GetAvailabilityHandler } from "./application/queries/get-availability.handler.js";
import { GetCockpitHandler } from "./application/queries/get-cockpit.handler.js";
import { GetSlotsHandler } from "./application/queries/get-slots.handler.js";
import { ListAppointmentsHandler } from "./application/queries/list-appointments.handler.js";
import { ListMyAppointmentsHandler } from "./application/queries/list-my-appointments.handler.js";
import { GetGrowthStatsHandler } from "./application/queries/get-growth-stats.handler.js";
import { GetMarketAdoptionHandler } from "./application/queries/get-market-adoption.handler.js";
import { GetMarketConfigHandler } from "./application/queries/get-market-config.handler.js";
import { GetMarketSectorsHandler } from "./application/queries/get-market-sectors.handler.js";
import { GetAcquisitionMetricsHandler } from "./application/queries/get-acquisition-metrics.handler.js";
import { GetMarketVolumeHandler } from "./application/queries/get-market-volume.handler.js";
import { GetOrderMetricsHandler } from "./application/queries/get-order-metrics.handler.js";
import { GetPortfolioMetricsHandler } from "./application/queries/get-portfolio-metrics.handler.js";
import { GetSectorRevenueHandler } from "./application/queries/get-sector-revenue.handler.js";
import { GetTerminationStatsHandler } from "./application/queries/get-termination-stats.handler.js";
import { ListActivationsHandler } from "./application/queries/list-activations.handler.js";
import { ListLeadsHandler } from "./application/queries/list-leads.handler.js";
import { ListProspectsHandler } from "./application/queries/list-prospects.handler.js";
import { ActivationReader } from "./domain/ports/activation.reader.js";
import { AppointmentReader } from "./domain/ports/appointment.reader.js";
import { AppointmentRepository } from "./domain/ports/appointment.repository.js";
import { AvailabilityStore } from "./domain/ports/availability.store.js";
import { ActivityRecorder } from "./domain/ports/activity-recorder.js";
import { GrowthStatsReader } from "./domain/ports/growth-stats.reader.js";
import { MarketAdoptionReader } from "./domain/ports/market-adoption.reader.js";
import { MarketConfigStore } from "./domain/ports/market-config.store.js";
import { MarketSectorsReader } from "./domain/ports/market-sectors.reader.js";
import { AcquisitionMetricsReader } from "./domain/ports/acquisition-metrics.reader.js";
import { MarketVolumeReader } from "./domain/ports/market-volume.reader.js";
import { OrderMetricsReader } from "./domain/ports/order-metrics.reader.js";
import { PortfolioMetricsReader } from "./domain/ports/portfolio-metrics.reader.js";
import { SectorRevenueReader } from "./domain/ports/sector-revenue.reader.js";
import { TerminationStatsReader } from "./domain/ports/termination-stats.reader.js";
import { MarketDirectory } from "./domain/ports/market-directory.js";
import { LeadEventSource } from "./domain/ports/lead-event-source.js";
import { LeadReader } from "./domain/ports/lead.reader.js";
import { LeadRepository } from "./domain/ports/lead.repository.js";
import { LeadScoreReader } from "./domain/ports/lead-score.reader.js";
import { LeadScoreStore } from "./domain/ports/lead-score.store.js";
import { ProspectReader } from "./domain/ports/prospect.reader.js";
import { AdminActivationsController } from "./http/admin-activations.controller.js";
import { AdminAppointmentsController } from "./http/admin-appointments.controller.js";
import { AppointmentsController } from "./http/appointments.controller.js";
import { AdminCockpitController } from "./http/admin-cockpit.controller.js";
import { AdminGrowthController } from "./http/admin-growth.controller.js";
import { AdminLeadsController } from "./http/admin-leads.controller.js";
import { AdminMarketController } from "./http/admin-market.controller.js";
import { AdminProspectsController } from "./http/admin-prospects.controller.js";
import { AdminRecomputeController } from "./http/admin-recompute.controller.js";
import { PrismaActivationReader } from "./infrastructure/prisma-activation.reader.js";
import { PrismaActivityRecorder } from "./infrastructure/prisma-activity-recorder.js";
import { PrismaActorNamer } from "./infrastructure/prisma-actor-namer.js";
import { CompanyNamer } from "./domain/ports/company-namer.js";
import { PrismaCompanyNamer } from "./infrastructure/prisma-company-namer.js";
import { ActivityJournalReader } from "./domain/ports/activity-journal.reader.js";
import { PrismaActivityJournalReader } from "./infrastructure/prisma-activity-journal.reader.js";
import { AdminActivityController } from "./http/admin-activity.controller.js";
import { ReadActivityJournalHandler } from "./application/queries/read-activity-journal.handler.js";
import {
  OnKbisCertificationRevoked,
  OnKbisCertified,
} from "./application/handlers/on-kbis-certification.handler.js";
import { ActorNamer } from "./domain/ports/actor-namer.js";
import { PrismaAppointmentReader } from "./infrastructure/prisma-appointment.reader.js";
import { PrismaAppointmentRepository } from "./infrastructure/prisma-appointment.repository.js";
import { PrismaAvailabilityStore } from "./infrastructure/prisma-availability.store.js";
import { PrismaGrowthStatsReader } from "./infrastructure/prisma-growth-stats.reader.js";
import { PrismaLeadEventSource } from "./infrastructure/prisma-lead-event-source.js";
import { PrismaMarketAdoptionReader } from "./infrastructure/prisma-market-adoption.reader.js";
import { PrismaMarketConfigStore } from "./infrastructure/prisma-market-config.store.js";
import { PrismaMarketSectorsReader } from "./infrastructure/prisma-market-sectors.reader.js";
import { PrismaAcquisitionMetricsReader } from "./infrastructure/prisma-acquisition-metrics.reader.js";
import { PrismaMarketVolumeReader } from "./infrastructure/prisma-market-volume.reader.js";
import { PrismaOrderMetricsReader } from "./infrastructure/prisma-order-metrics.reader.js";
import { PrismaPortfolioMetricsReader } from "./infrastructure/prisma-portfolio-metrics.reader.js";
import { PrismaSectorRevenueReader } from "./infrastructure/prisma-sector-revenue.reader.js";
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
  controllers: [
    AdminProspectsController,
    AdminActivationsController,
    AdminRecomputeController,
    AdminCockpitController,
    AdminLeadsController,
    AdminGrowthController,
    AdminMarketController,
    AdminAppointmentsController,
    AppointmentsController,
    // Le journal traverse tous les modules, mais la table qui le porte vit ici :
    // sa surface de lecture aussi, tant que le journal n'a pas été promu en
    // `platform/` (cf. `pim/journal/pim-journal.ts`).
    AdminActivityController,
  ],
  providers: [
    { provide: ActivityRecorder, useClass: PrismaActivityRecorder },
    { provide: ActorNamer, useClass: PrismaActorNamer },
    { provide: CompanyNamer, useClass: PrismaCompanyNamer },
    { provide: ActivityJournalReader, useClass: PrismaActivityJournalReader },
    ReadActivityJournalHandler,
    OnKbisCertified,
    OnKbisCertificationRevoked,
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
    { provide: MarketSectorsReader, useClass: PrismaMarketSectorsReader },
    { provide: MarketVolumeReader, useClass: PrismaMarketVolumeReader },
    { provide: OrderMetricsReader, useClass: PrismaOrderMetricsReader },
    { provide: PortfolioMetricsReader, useClass: PrismaPortfolioMetricsReader },
    { provide: AcquisitionMetricsReader, useClass: PrismaAcquisitionMetricsReader },
    { provide: SectorRevenueReader, useClass: PrismaSectorRevenueReader },
    { provide: TerminationStatsReader, useClass: PrismaTerminationStatsReader },
    { provide: AvailabilityStore, useClass: PrismaAvailabilityStore },
    { provide: AppointmentRepository, useClass: PrismaAppointmentRepository },
    { provide: AppointmentReader, useClass: PrismaAppointmentReader },
    RecomputeGuard,
    RecomputeLeadScoresHandler,
    CaptureLeadHandler,
    ChangeLeadStatusHandler,
    GetCockpitHandler,
    GetGrowthStatsHandler,
    GetMarketConfigHandler,
    GetMarketAdoptionHandler,
    GetMarketSectorsHandler,
    GetMarketVolumeHandler,
    GetOrderMetricsHandler,
    GetPortfolioMetricsHandler,
    GetAcquisitionMetricsHandler,
    GetSectorRevenueHandler,
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
    OnSupportRequested,
    OnSupportHandled,
    SaveAvailabilityHandler,
    SaveAvailabilityExceptionsHandler,
    SaveBookingPolicyHandler,
    GetAppointmentHandler,
    GetAvailabilityHandler,
    GetSlotsHandler,
    BookAppointmentHandler,
    ScheduleAppointmentHandler,
    TransitionAppointmentHandler,
    CancelOwnAppointmentHandler,
    ListAppointmentsHandler,
    ListMyAppointmentsHandler,
  ],
  exports: [ActivityRecorder],
})
export class GrowthModule {}
