import { Module } from "@nestjs/common";

import { CancelCollectionBatchHandler } from "./application/commands/cancel-collection-batch.handler.js";
import { ConstituteCollectionBatchesHandler } from "./application/commands/constitute-collection-batches.handler.js";
import { SendCollectionNotice } from "./application/handlers/send-collection-notice.handler.js";
import { CollectionNoticeSender } from "./application/services/collection-notice-sender.js";
import { BatchNoticeStatesReader } from "./domain/ports/batch-notice-states.reader.js";
import { CollectionNoticeRepository } from "./domain/ports/collection-notice.repository.js";
import { CycleNoticesReader } from "./domain/ports/cycle-notices.reader.js";
import { PayerNoticeContactsReader } from "./domain/ports/payer-notice-contacts.reader.js";
import { PrismaBatchNoticeStatesReader } from "./infrastructure/prisma-batch-notice-states.reader.js";
import { PrismaCollectionNoticeRepository } from "./infrastructure/prisma-collection-notice.repository.js";
import { PrismaCycleNoticesReader } from "./infrastructure/prisma-cycle-notices.reader.js";
import { PrismaPayerNoticeContactsReader } from "./infrastructure/prisma-payer-notice-contacts.reader.js";
import { DepositCollectionBatchHandler } from "./application/commands/deposit-collection-batch.handler.js";
import { SettleOrderOtherwiseHandler } from "./application/commands/settle-order-otherwise.handler.js";
import { ExportCollectionBatchAuditHandler } from "./application/queries/export-collection-batch-audit.handler.js";
import { ExportCollectionBatchFileHandler } from "./application/queries/export-collection-batch-file.handler.js";
import { GetCollectionCycleHandler } from "./application/queries/get-collection-cycle.handler.js";
import { GetCollectionPreviewHandler } from "./application/queries/get-collection-preview.handler.js";
import { GetBillingStatementHandler } from "./application/queries/get-billing-statement.handler.js";
import { BillingStatementReader } from "./domain/ports/billing-statement.reader.js";
import { AdminBillingStatementsController } from "./http/admin-billing-statements.controller.js";
import { PrismaBillingStatementReader } from "./infrastructure/prisma-billing-statement.reader.js";
import { BillingStatementRepository } from "./domain/ports/billing-statement.repository.js";
import { StatementBuyerReader } from "./domain/ports/statement-buyer.reader.js";
import { PrismaBillingStatementRepository } from "./infrastructure/prisma-billing-statement.repository.js";
import { PrismaStatementBuyerReader } from "./infrastructure/prisma-statement-buyer.reader.js";
import { CancelledOrdersReader } from "./domain/ports/cancelled-orders.reader.js";
import { CollectionBatchReader } from "./domain/ports/collection-batch.reader.js";
import { CollectionBatchRepository } from "./domain/ports/collection-batch.repository.js";
import { CollectionCandidatesReader } from "./domain/ports/collection-candidates.reader.js";
import { CollectionLock } from "./domain/ports/collection-lock.js";
import { OrderCollectionRepository } from "./domain/ports/order-collection.repository.js";
import { OrderNumbersReader } from "./domain/ports/order-numbers.reader.js";
import { RecordedClosureReader } from "./domain/ports/recorded-closure.reader.js";
import { AdminCollectionBatchesController } from "./http/admin-collection-batches.controller.js";
import { CollectionAutopilotController } from "./http/collection-autopilot.controller.js";
import { RunCollectionAutopilotHandler } from "./application/commands/run-collection-autopilot.handler.js";
import { BusAutomaticCollectionConstituter } from "./application/services/bus-automatic-collection-constituter.js";
import { AutoCollectionEntitiesReader } from "./domain/ports/auto-collection-entities.reader.js";
import { AutomaticCollectionConstituter } from "./domain/ports/automatic-collection-constituter.js";
import { CollectionAutopilotRuns } from "./domain/ports/collection-autopilot-runs.js";
import { LastAutopilotRunReader } from "./domain/ports/last-autopilot-run.reader.js";
import { PrismaAutoCollectionEntitiesReader } from "./infrastructure/prisma-auto-collection-entities.reader.js";
import {
  PrismaCollectionAutopilotRuns,
  PrismaLastAutopilotRunReader,
} from "./infrastructure/prisma-collection-autopilot-runs.js";
import { AdminDetachedUnpaidController } from "./http/admin-detached-unpaid.controller.js";
import { CompanyDetachedUnpaidController } from "./http/company-detached-unpaid.controller.js";
import { DetachedUnpaidReader } from "./domain/ports/detached-unpaid.reader.js";
import { UnpaidAccessReader } from "./domain/ports/unpaid-access.reader.js";
import { PrismaDetachedUnpaidReader } from "./infrastructure/prisma-detached-unpaid.reader.js";
import { PrismaUnpaidAccessReader } from "./infrastructure/prisma-unpaid-access.reader.js";
import { GetDetachedUnpaidOrdersHandler } from "./application/queries/get-detached-unpaid-orders.handler.js";
import { GetMyDetachedUnpaidOrdersHandler } from "./application/queries/get-my-detached-unpaid-orders.handler.js";
import { PrismaCollectionBatchReader } from "./infrastructure/prisma-collection-batch.reader.js";
import { PrismaCollectionBatchRepository } from "./infrastructure/prisma-collection-batch.repository.js";
import { PrismaCollectionCandidatesReader } from "./infrastructure/prisma-collection-candidates.reader.js";
import { PrismaCollectionLock } from "./infrastructure/prisma-collection-lock.js";
import {
  PrismaCancelledOrdersReader,
  PrismaOrderNumbersReader,
} from "./infrastructure/prisma-collection-orders.readers.js";
import { PrismaOrderCollectionRepository } from "./infrastructure/prisma-order-collection.repository.js";
import { PrismaRecordedClosureReader } from "./infrastructure/prisma-recorded-closure.reader.js";

import { AssignCreditorIdentifierHandler } from "./application/commands/assign-creditor-identifier.handler.js";
import { CorrectLegalEntityHandler } from "./application/commands/correct-legal-entity.handler.js";
import { DeclareLegalEntityHandler } from "./application/commands/declare-legal-entity.handler.js";
import { RemoveLegalEntityLogoHandler } from "./application/commands/remove-legal-entity-logo.handler.js";
import { SetCreditorAccountHandler } from "./application/commands/set-creditor-account.handler.js";
import { SetLegalEntityArchivedHandler } from "./application/commands/set-legal-entity-archived.handler.js";
import { SetLegalEntityLogoHandler } from "./application/commands/set-legal-entity-logo.handler.js";
import { SetMandateDefaultsHandler } from "./application/commands/set-mandate-defaults.handler.js";
import { SetMandateSchemeHandler } from "./application/commands/set-mandate-scheme.handler.js";
import { SetPreNotificationHandler } from "./application/commands/set-pre-notification.handler.js";
import { SetCollectionScheduleHandler } from "./application/commands/set-collection-schedule.handler.js";
import { SetAutoCollectionHandler } from "./application/commands/set-auto-collection.handler.js";
import { ExportCycleAuditHandler } from "./application/queries/export-cycle-audit.handler.js";
import { ExportCycleDraftHandler } from "./application/queries/export-cycle-draft.handler.js";
import { GetCurrentBillingCycleHandler } from "./application/queries/get-current-billing-cycle.handler.js";
import { ExportCycleStatementHandler } from "./application/queries/export-cycle-statement.handler.js";
import { GetCycleStatementHandler } from "./application/queries/get-cycle-statement.handler.js";
import { ExportInvoiceDossierHandler } from "./application/queries/export-invoice-dossier.handler.js";
import { GetInvoiceDossierHandler } from "./application/queries/get-invoice-dossier.handler.js";
import { ListStatementCyclesHandler } from "./application/queries/list-statement-cycles.handler.js";
import { GetMandateSchemeUsageHandler } from "./application/queries/get-mandate-scheme-usage.handler.js";
import { ExportSampleMandateHandler } from "./application/queries/export-sample-mandate.handler.js";
import { GetLegalEntityLogoHandler } from "./application/queries/get-legal-entity-logo.handler.js";
import { GetLegalEntityHandler } from "./application/queries/get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "./application/queries/list-legal-entities.handler.js";
import { BillableOrdersReader } from "./domain/ports/billable-orders.reader.js";
import { CreditorReader } from "./domain/ports/creditor.reader.js";
import { CycleOrdersReader } from "./domain/ports/cycle-orders.reader.js";
import { InvoiceDossierReader } from "./domain/ports/invoice-dossier.reader.js";
import { StatementBillingReader } from "./domain/ports/statement-billing.reader.js";
import { FirstMandateLedger } from "./domain/ports/first-mandate-ledger.js";
import { LegalEntityLogoReader } from "./domain/ports/legal-entity-logo.reader.js";
import { LegalEntityReader } from "./domain/ports/legal-entity.reader.js";
import { LegalEntityRepository } from "./domain/ports/legal-entity.repository.js";
import { AdminBillingCycleController } from "./http/admin-billing-cycle.controller.js";
import { AdminCycleStatementsController } from "./http/admin-cycle-statements.controller.js";
import { AdminInvoiceDossiersController } from "./http/admin-invoice-dossiers.controller.js";
import { AdminLegalEntitiesController } from "./http/admin-legal-entities.controller.js";
import { AdminLegalEntityBankingController } from "./http/admin-legal-entity-banking.controller.js";
import { AdminLegalEntityDocumentsController } from "./http/admin-legal-entity-documents.controller.js";
import { PrismaBillableOrdersReader } from "./infrastructure/prisma-billable-orders.reader.js";
import { PrismaCycleOrdersReader } from "./infrastructure/prisma-cycle-orders.reader.js";
import { PrismaInvoiceDossierReader } from "./infrastructure/prisma-invoice-dossier.reader.js";
import { PrismaStatementBillingReader } from "./infrastructure/prisma-statement-billing.reader.js";
import { PrismaCreditorReader } from "./infrastructure/prisma-creditor.reader.js";
import { PrismaFirstMandateLedger } from "./infrastructure/prisma-first-mandate-ledger.js";
import { PrismaLegalEntityLogoReader } from "./infrastructure/prisma-legal-entity-logo.reader.js";
import { PrismaLegalEntityReader } from "./infrastructure/prisma-legal-entity.reader.js";
import { PrismaLegalEntityRepository } from "./infrastructure/prisma-legal-entity.repository.js";

/**
 * Contexte **comptabilité** — qui encaisse, et sous quelle identité.
 *
 * **Cinq** ports sur une seule table, et l'ISP n'est pas ici une élégance :
 * `CreditorReader` est le seul port de LECTURE de l'émetteur qui sort, parce
 * qu'il est le seul que d'autres contextes ont le droit de consommer. Il rend une
 * copie figée. Exporter le port
 * d'écriture laisserait `payments` charger l'agrégat et le muter depuis chez
 * lui — et l'immuabilité de l'ICS ne serait plus tenue par personne.
 *
 * Le quatrième, `LegalEntityLogoReader`, est le plus étroit : une méthode, qui
 * rend une clé de stockage. Les deux chemins qui LISENT un logo — la vignette de
 * la fiche et le dessin du mandat — n'ont besoin que d'elle, et leur donner le
 * port d'écriture leur donnerait `save()` sur un trajet de lecture.
 *
 * Le cinquième, `FirstMandateLedger`, est le seul port d'ÉCRITURE qui sort, et
 * il ne pose qu'un fait : « un mandat a été frappé sous cet émetteur ». La frappe
 * l'appelle dans sa transaction (plan `plan-restes-du-mandat.md` §8, lot B) ;
 * elle ne reçoit pas pour autant le droit de charger l'entité.
 *
 * `DocumentStore` n'est pas déclaré ici : il vient de `ContextModule`, qui est
 * `@Global` et décide du bucket à la racine de composition. Un contexte métier
 * ne choisit pas le bucket dans lequel il écrit.
 */
@Module({
  controllers: [
    // Trois surfaces sur la même adresse de base : le registre, ce qui décide
    // de l'encaissement, et ce qui sort en octets. Les chemins ne se recouvrent
    // pas, donc l'ordre ci-dessous ne décide de rien.
    AdminLegalEntitiesController,
    AdminLegalEntityBankingController,
    AdminLegalEntityDocumentsController,
    AdminBillingCycleController,
    AdminCycleStatementsController,
    AdminInvoiceDossiersController,
    AdminCollectionBatchesController,
    CollectionAutopilotController,
    AdminBillingStatementsController,
    AdminDetachedUnpaidController,
    CompanyDetachedUnpaidController,
  ],
  providers: [
    { provide: LegalEntityRepository, useClass: PrismaLegalEntityRepository },
    { provide: LegalEntityReader, useClass: PrismaLegalEntityReader },
    { provide: CreditorReader, useClass: PrismaCreditorReader },
    { provide: BillableOrdersReader, useClass: PrismaBillableOrdersReader },
    { provide: CycleOrdersReader, useClass: PrismaCycleOrdersReader },
    // Le dossier de facturation simulé (plan `plan-simulateur-dossier-de-facturation.md`).
    { provide: InvoiceDossierReader, useClass: PrismaInvoiceDossierReader },
    { provide: StatementBillingReader, useClass: PrismaStatementBillingReader },
    { provide: LegalEntityLogoReader, useClass: PrismaLegalEntityLogoReader },
    { provide: FirstMandateLedger, useClass: PrismaFirstMandateLedger },
    // Le lot de prélèvement figé (plan `plan-lot-de-prelevement-fige.md`).
    { provide: CollectionCandidatesReader, useClass: PrismaCollectionCandidatesReader },
    { provide: RecordedClosureReader, useClass: PrismaRecordedClosureReader },
    { provide: CollectionBatchRepository, useClass: PrismaCollectionBatchRepository },
    { provide: OrderCollectionRepository, useClass: PrismaOrderCollectionRepository },
    { provide: CollectionBatchReader, useClass: PrismaCollectionBatchReader },
    { provide: CollectionLock, useClass: PrismaCollectionLock },
    // L'arrêté de facturation figé (plan `plan-le-prelevement-suit-la-facture.md`, F3).
    { provide: BillingStatementRepository, useClass: PrismaBillingStatementRepository },
    { provide: StatementBuyerReader, useClass: PrismaStatementBuyerReader },
    { provide: BillingStatementReader, useClass: PrismaBillingStatementReader },
    { provide: CancelledOrdersReader, useClass: PrismaCancelledOrdersReader },
    { provide: OrderNumbersReader, useClass: PrismaOrderNumbersReader },
    // L'avis de prélèvement (plan `plan-prelevement-automatique.md`, PA2).
    { provide: CollectionNoticeRepository, useClass: PrismaCollectionNoticeRepository },
    { provide: CycleNoticesReader, useClass: PrismaCycleNoticesReader },
    { provide: BatchNoticeStatesReader, useClass: PrismaBatchNoticeStatesReader },
    { provide: PayerNoticeContactsReader, useClass: PrismaPayerNoticeContactsReader },
    CollectionNoticeSender,
    SendCollectionNotice,
    // La constitution automatique (PA3).
    { provide: CollectionAutopilotRuns, useClass: PrismaCollectionAutopilotRuns },
    { provide: LastAutopilotRunReader, useClass: PrismaLastAutopilotRunReader },
    { provide: AutoCollectionEntitiesReader, useClass: PrismaAutoCollectionEntitiesReader },
    { provide: AutomaticCollectionConstituter, useClass: BusAutomaticCollectionConstituter },
    RunCollectionAutopilotHandler,
    // Les impayés d'un site détaché (plan-sous-comptes §2.1 quater).
    { provide: DetachedUnpaidReader, useClass: PrismaDetachedUnpaidReader },
    { provide: UnpaidAccessReader, useClass: PrismaUnpaidAccessReader },
    GetDetachedUnpaidOrdersHandler,
    GetMyDetachedUnpaidOrdersHandler,
    ConstituteCollectionBatchesHandler,
    CancelCollectionBatchHandler,
    DepositCollectionBatchHandler,
    SettleOrderOtherwiseHandler,
    GetCollectionCycleHandler,
    GetCollectionPreviewHandler,
    GetBillingStatementHandler,
    ExportCollectionBatchFileHandler,
    ExportCollectionBatchAuditHandler,
    DeclareLegalEntityHandler,
    CorrectLegalEntityHandler,
    AssignCreditorIdentifierHandler,
    SetCreditorAccountHandler,
    SetMandateDefaultsHandler,
    SetMandateSchemeHandler,
    SetPreNotificationHandler,
    SetCollectionScheduleHandler,
    SetAutoCollectionHandler,
    SetLegalEntityArchivedHandler,
    SetLegalEntityLogoHandler,
    RemoveLegalEntityLogoHandler,
    ListLegalEntitiesHandler,
    GetLegalEntityHandler,
    GetMandateSchemeUsageHandler,
    ExportSampleMandateHandler,
    GetCurrentBillingCycleHandler,
    ExportCycleDraftHandler,
    ExportCycleAuditHandler,
    ListStatementCyclesHandler,
    GetCycleStatementHandler,
    ExportCycleStatementHandler,
    GetInvoiceDossierHandler,
    ExportInvoiceDossierHandler,
    GetLegalEntityLogoHandler,
  ],
  // `LegalEntityLogoReader` sort avec `CreditorReader`, et pas seul : le seul
  // consommateur extérieur est l'aperçu de mandat d'un client (`payments`), qui
  // a besoin des deux pour dessiner le MÊME document que la fiche d'exemple.
  // Exporter le lecteur de logo sans l'émetteur n'aurait aucun usage.
  // `FirstMandateLedger` sort pour la frappe, seule à savoir qu'un mandat naît.
  exports: [CreditorReader, LegalEntityLogoReader, FirstMandateLedger],
})
export class AccountingModule {}
