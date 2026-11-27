import { Module } from "@nestjs/common";

import { ClosedPlansReader } from "../channels/commerce/closed-plans.reader.js";
import { InscribedOrdersReader } from "../channels/commerce/inscribed-orders.reader.js";
import { OrderInscriptionReader } from "../channels/commerce/order-inscription.reader.js";
import { PruneProductionDayChangesHandler } from "./application/commands/prune-production-day-changes.handler.js";
import { OnPackingReturned } from "./application/handlers/on-packing-returned.handler.js";
import { GetProductionDueThresholdsHandler } from "./application/queries/get-production-due-thresholds.handler.js";
import { DayInscribedOrderHeaderReader } from "./application/services/day-inscribed-order-header.reader.js";
import { DayPlannedDestinationsReader } from "./application/services/day-planned-destinations.reader.js";
import { LedgerPlanVersionRecorder } from "./application/services/ledger-plan-version-recorder.js";
import { PlanVersionRecorder } from "./domain/ports/plan-version.recorder.js";
import { ProductionDayVersionSource } from "./application/services/production-day-version.source.js";
import { ProductionOrderRevisionDesk } from "./application/services/production-order-revision.desk.js";
import { ProductionOrderWithdrawalDesk } from "./application/services/production-order-withdrawal.desk.js";
import { ArrestedPlanLinesReader } from "./domain/ports/arrested-plan-lines.reader.js";
import { KnownArticles } from "./domain/ports/known-articles.reader.js";
import { LaunchedResupplyLookup } from "./domain/ports/launched-resupply.lookup.js";
import { OrderRevisionNoticeLedger } from "./domain/ports/order-revision-notice.ledger.js";
import { OrderRevisionNoticesReader } from "./domain/ports/order-revision-notices.reader.js";
import { OrderWithdrawalLedger } from "./domain/ports/order-withdrawal.ledger.js";
import { OrderWithdrawalsReader } from "./domain/ports/order-withdrawals.reader.js";
import { PlanVersionLedger } from "./domain/ports/plan-version.ledger.js";
import { PlanVersionsReader } from "./domain/ports/plan-versions.reader.js";
import { WithdrawalsAfterInscriptionReader } from "./domain/ports/withdrawals-after-inscription.reader.js";
import { PlannedOrderLinesReader } from "./domain/ports/planned-order-lines.reader.js";
import { ProductionBatchRepository } from "./domain/ports/production-batch.repository.js";
import { ProductionDayChangePruner } from "./domain/ports/production-day-change.pruner.js";
import { CountedProductNameReader } from "./domain/ports/counted-product-name.reader.js";
import { ProductionDayStatusReader } from "./domain/ports/production-day-status.reader.js";
import { ProductionDayVersionReader } from "./domain/ports/production-day-version.reader.js";
import { ProductionDayLock } from "./domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
import { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
import { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
import { ProductionReturnRequests } from "./domain/ports/production-return.requests.js";
import { ProductionTrancheSettingsReader } from "./domain/ports/production-tranche-settings.reader.js";
import { ProductionTrancheSettingsRepository } from "./domain/ports/production-tranche-settings.repository.js";
import { ProductionDayChangeSweepController } from "./http/production-day-change-sweep.controller.js";
import { PrismaArrestedPlanLinesReader } from "./infrastructure/prisma-arrested-plan-lines.reader.js";
import { PrismaKnownArticles } from "./infrastructure/prisma-known-articles.reader.js";
import { PrismaArrestedPlanHold } from "./infrastructure/prisma-arrested-plan.hold.js";
import { PrismaCurrentArrestHold } from "./infrastructure/prisma-current-arrest.hold.js";
import { PrismaOutputCorrectionsReader } from "./infrastructure/prisma-output-corrections.reader.js";
import { PrismaAtelierSheetsReader } from "./infrastructure/prisma-atelier-sheets.reader.js";
import { PrismaClosedPlansReader } from "./infrastructure/prisma-closed-plans.reader.js";
import { PrismaFrozenResuppliesReader } from "./infrastructure/prisma-frozen-resupplies.reader.js";
import { PrismaLaunchedResupplyLookup } from "./infrastructure/prisma-launched-resupply.lookup.js";
import { PrismaInscribedOrdersReader } from "./infrastructure/prisma-inscribed-orders.reader.js";
import { PrismaOrderInscriptionReader } from "./infrastructure/prisma-order-inscription.reader.js";
import { PrismaOrderRevisionNoticeLedger } from "./infrastructure/prisma-order-revision-notice.ledger.js";
import { PrismaOrderRevisionNoticesReader } from "./infrastructure/prisma-order-revision-notices.reader.js";
import { PrismaOrderWithdrawalLedger } from "./infrastructure/prisma-order-withdrawal.ledger.js";
import { PrismaOrderWithdrawalsReader } from "./infrastructure/prisma-order-withdrawals.reader.js";
import {
  PrismaPlanVersionLedger,
  PrismaPlanVersionsReader,
} from "./infrastructure/prisma-plan-versions.js";
import { PrismaWithdrawalsAfterInscriptionReader } from "./infrastructure/prisma-withdrawals-after-inscription.reader.js";
import { PrismaPlannedOrderLinesReader } from "./infrastructure/prisma-planned-order-lines.reader.js";
import { PrismaProductionBatchRepository } from "./infrastructure/prisma-production-batch.repository.js";
import { PrismaProductionDayChangePruner } from "./infrastructure/prisma-production-day-change.pruner.js";
import { PrismaCountedProductNameReader } from "./infrastructure/prisma-counted-product-name.reader.js";
import { PrismaProductionDayStatusReader } from "./infrastructure/prisma-production-day-status.reader.js";
import { PrismaProductionDayVersionReader } from "./infrastructure/prisma-production-day-version.reader.js";
import { PrismaProductionDayLock } from "./infrastructure/prisma-production-day.lock.js";
import { PrismaProductionDayRepository } from "./infrastructure/prisma-production-day.repository.js";
import { PrismaProductionHandoffLedger } from "./infrastructure/prisma-production-handoff.ledger.js";
import { PrismaProductionHandoffReader } from "./infrastructure/prisma-production-handoff.reader.js";
import { PrismaProductionReturnRequests } from "./infrastructure/prisma-production-return.requests.js";
import { PrismaProductionTrancheSettingsReader } from "./infrastructure/prisma-production-tranche-settings.reader.js";
import { PrismaProductionTrancheSettingsRepository } from "./infrastructure/prisma-production-tranche-settings.repository.js";

/**
 * **La journée du fournil** — le noyau, et le seul module que les métiers
 * importent, jamais l'inverse
 * (`documentation/fournil/architecture-contexte-production.md`, « Les modules du fournil »).
 *
 * Il exporte deux choses, et rien d'autre : ce que les métiers injectent du
 * noyau (dépôt, verrou, fournées, état, tranches, retraits, remises, et les
 * lectures nommées sur ses tables), et les
 * guichets et lecteurs que la racine de composition relie aux autres blocs.
 * Il n'importe aucun métier : un métier qui a besoin de la journée l'importe,
 * jamais l'inverse.
 */
@Module({
  controllers: [ProductionDayChangeSweepController],
  providers: [
    { provide: ProductionDayRepository, useClass: PrismaProductionDayRepository },
    { provide: ProductionBatchRepository, useClass: PrismaProductionBatchRepository },
    { provide: ProductionDayLock, useClass: PrismaProductionDayLock },
    // L'en-tête seul : une lecture ciblée, à part du dépôt qui relit la journée entière (ISP).
    { provide: ProductionDayStatusReader, useClass: PrismaProductionDayStatusReader },
    { provide: CountedProductNameReader, useClass: PrismaCountedProductNameReader },
    { provide: ProductionTrancheSettingsReader, useClass: PrismaProductionTrancheSettingsReader },
    {
      provide: ProductionTrancheSettingsRepository,
      useClass: PrismaProductionTrancheSettingsRepository,
    },
    GetProductionDueThresholdsHandler,
    // La version par journée : lire et balayer le journal sont deux ports (ISP).
    ProductionDayVersionSource,
    PruneProductionDayChangesHandler,
    { provide: ProductionDayVersionReader, useClass: PrismaProductionDayVersionReader },
    { provide: ProductionDayChangePruner, useClass: PrismaProductionDayChangePruner },
    // La remise au colisage, les retours demandés, et sa réponse.
    { provide: ProductionHandoffLedger, useClass: PrismaProductionHandoffLedger },
    { provide: ProductionHandoffReader, useClass: PrismaProductionHandoffReader },
    { provide: ProductionReturnRequests, useClass: PrismaProductionReturnRequests },
    OnPackingReturned,
    // L'annulation staff : le registre des retraits, lu sous le verrou, et le
    // guichet que le commerce appelle — relié par `ProductionDeskFeedModule`.
    { provide: OrderWithdrawalLedger, useClass: PrismaOrderWithdrawalLedger },
    { provide: OrderWithdrawalsReader, useClass: PrismaOrderWithdrawalsReader },
    PrismaOrderInscriptionReader,
    { provide: OrderInscriptionReader, useExisting: PrismaOrderInscriptionReader },
    PrismaInscribedOrdersReader,
    { provide: InscribedOrdersReader, useExisting: PrismaInscribedOrdersReader },
    ProductionOrderWithdrawalDesk,
    // La modification d'une commande : les notes de révision, écrites par le guichet sous le verrou.
    { provide: OrderRevisionNoticeLedger, useClass: PrismaOrderRevisionNoticeLedger },
    { provide: OrderRevisionNoticesReader, useClass: PrismaOrderRevisionNoticesReader },
    ProductionOrderRevisionDesk,
    // Les versions du plan : écrire et lire sont deux ports (ISP), les
    // retraits après inscription un troisième ; les gestes qui changent le
    // plan figé sauvent la journée par l'écrivain des versions.
    { provide: PlanVersionLedger, useClass: PrismaPlanVersionLedger },
    { provide: PlanVersionsReader, useClass: PrismaPlanVersionsReader },
    {
      provide: WithdrawalsAfterInscriptionReader,
      useClass: PrismaWithdrawalsAfterInscriptionReader,
    },
    { provide: PlanVersionRecorder, useClass: LedgerPlanVersionRecorder },
    // Publiés pour le colisage et la pierre tombale ; reliés par `PackingFeedModule`.
    DayPlannedDestinationsReader,
    DayInscribedOrderHeaderReader,
    // Les lectures nommées que les métiers font sur les tables du noyau : le
    // prévisionnel du plan, la retenue de la qualité, le réassort lancé.
    { provide: ArrestedPlanLinesReader, useClass: PrismaArrestedPlanLinesReader },
    { provide: PlannedOrderLinesReader, useClass: PrismaPlannedOrderLinesReader },
    { provide: LaunchedResupplyLookup, useClass: PrismaLaunchedResupplyLookup },
    // Les articles des journées arrêtées : la page Postes et son alerte.
    { provide: KnownArticles, useClass: PrismaKnownArticles },
    // Les canaux que le noyau implémente sur ses tables : l'arrêt du plan comme
    // limite (relié par `ProductionDeskFeedModule`, lu aussi par le guichet
    // d'admission du plan), le plan tenu arrêté (`PackingFeedModule`), les
    // réassorts figés (`ProductionDeliveryFeedModule`), les commandes sans
    // feuille (`HandoverFeedModule`).
    PrismaClosedPlansReader,
    { provide: ClosedPlansReader, useExisting: PrismaClosedPlansReader },
    PrismaArrestedPlanHold,
    PrismaCurrentArrestHold,
    PrismaFrozenResuppliesReader,
    PrismaAtelierSheetsReader,
    // Les corrections de déclaration d'une journée (`PackingFeedModule`).
    PrismaOutputCorrectionsReader,
  ],
  exports: [
    // Ce que les métiers injectent du noyau.
    ProductionDayRepository,
    ProductionBatchRepository,
    ProductionDayLock,
    PlanVersionRecorder,
    CountedProductNameReader,
    ProductionDayStatusReader,
    ProductionTrancheSettingsReader,
    ProductionTrancheSettingsRepository,
    OrderWithdrawalsReader,
    ProductionHandoffLedger,
    ProductionHandoffReader,
    ProductionReturnRequests,
    ArrestedPlanLinesReader,
    PlannedOrderLinesReader,
    LaunchedResupplyLookup,
    KnownArticles,
    ClosedPlansReader,
    // Ce que la racine de composition relie aux autres blocs.
    ProductionDayVersionSource,
    DayPlannedDestinationsReader,
    ProductionOrderWithdrawalDesk,
    DayInscribedOrderHeaderReader,
    ProductionOrderRevisionDesk,
    PrismaOrderInscriptionReader,
    PrismaInscribedOrdersReader,
    PrismaClosedPlansReader,
    PrismaArrestedPlanHold,
    PrismaCurrentArrestHold,
    PrismaFrozenResuppliesReader,
    PrismaAtelierSheetsReader,
    PrismaOutputCorrectionsReader,
  ],
})
export class ProductionDayModule {}

/**
 * Les fournisseurs que ce module exporte et que la racine de composition
 * (`appBootstrap/`) relie à un port d'un autre bloc : elle les prend ici,
 * jamais dans l'intérieur du métier.
 */
export {
  DayInscribedOrderHeaderReader,
  DayPlannedDestinationsReader,
  PrismaArrestedPlanHold,
  PrismaAtelierSheetsReader,
  PrismaCurrentArrestHold,
  PrismaClosedPlansReader,
  PrismaFrozenResuppliesReader,
  PrismaInscribedOrdersReader,
  PrismaOrderInscriptionReader,
  PrismaOutputCorrectionsReader,
  ProductionDayVersionSource,
  ProductionOrderRevisionDesk,
  ProductionOrderWithdrawalDesk,
};
