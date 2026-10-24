import { AdminIssuedInvoicesController } from "./http/admin-issued-invoices.controller.js";
import { CompanyInvoicesController } from "./http/company-invoices.controller.js";
import { BILLING_MODE_CONTROLLERS, BILLING_MODE_PROVIDERS } from "./billing-mode.providers.js";
import { CARD_INVOICE_PROVIDERS } from "./card-invoice.providers.js";
import { DELIVERY_DAY_PROVIDERS } from "./delivery-day.providers.js";
import { MANDATE_BANK_EXPORT_PROVIDERS } from "./mandate-bank-export.providers.js";
import {
  COLLECTION_PROCEDURE_CONTROLLERS,
  COLLECTION_PROCEDURE_PROVIDERS,
} from "./collection-procedure.providers.js";
import {
  ACCOUNT_BANK_EXPORT_CONTROLLERS,
  ACCOUNT_BANK_EXPORT_PROVIDERS,
} from "./account-bank-export.providers.js";
import {
  COLLECTION_TEST_CONTROLLERS,
  COLLECTION_TEST_PROVIDERS,
} from "./collection-test.providers.js";
import { COLLECTION_RETURN_PROVIDERS } from "./collection-return.providers.js";
import { AdminCollectionReturnsController } from "./http/admin-collection-returns.controller.js";
import { ISSUED_INVOICE_PROVIDERS } from "./issued-invoice.providers.js";
import { Module } from "@nestjs/common";

import { CancelCollectionBatchHandler } from "./application/commands/cancel-collection-batch.handler.js";
import { RecordCollectionBatchDownloadHandler } from "./application/commands/record-collection-batch-download.handler.js";
import {
  CollectionAssemblyReaders,
  ConstitutionNoticeReaders,
  ConstitutionWriters,
} from "./application/collection-constitution-ports.js";
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
import { RejectCollectionBatchByBankHandler } from "./application/commands/reject-collection-batch-by-bank.handler.js";
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
import { InvoiceIssuersReader } from "./domain/ports/invoice-issuers.reader.js";
import { PrismaInvoiceIssuersReader } from "./infrastructure/prisma-invoice-issuers.reader.js";
import { PrismaBillingStatementRepository } from "./infrastructure/prisma-billing-statement.repository.js";
import { PrismaStatementBuyerReader } from "./infrastructure/prisma-statement-buyer.reader.js";
import { CancelledOrdersReader } from "./domain/ports/cancelled-orders.reader.js";
import { CollectionBatchReader } from "./domain/ports/collection-batch.reader.js";
import { CollectionBatchRepository } from "./domain/ports/collection-batch.repository.js";
import { CountedLotInputsReader } from "./domain/ports/counted-lot-inputs.reader.js";
import { CollectionCalendarReader } from "./domain/ports/collection-calendar.reader.js";
import { CollectionCandidatesReader } from "./domain/ports/collection-candidates.reader.js";
import { CollectionLock } from "./domain/ports/collection-lock.js";
import { CollectionBatchLock } from "./domain/ports/collection-batch-lock.js";
import { InvoiceNumbering } from "./domain/ports/invoice-numbering.js";
import { InvoiceReader } from "./domain/ports/invoice.reader.js";
import { InvoiceRepository } from "./domain/ports/invoice.repository.js";
import { InvoiceIssuer } from "./application/services/invoice-issuer.js";
import { PrismaInvoiceNumbering } from "./infrastructure/prisma-invoice-numbering.js";
import { PrismaInvoiceReader } from "./infrastructure/prisma-invoice.reader.js";
import { PrismaInvoiceRepository } from "./infrastructure/prisma-invoice.repository.js";
import { OrderCollectionRepository } from "./domain/ports/order-collection.repository.js";
import { OrderNumbersReader } from "./domain/ports/order-numbers.reader.js";
import { RecordedClosureReader } from "./domain/ports/recorded-closure.reader.js";
import { AdminCollectionBatchesController } from "./http/admin-collection-batches.controller.js";
import { AdminMandateBankExportsController } from "./http/admin-mandate-bank-exports.controller.js";
import { CollectionAutopilotController } from "./http/collection-autopilot.controller.js";
import { InvoiceAutopilotController } from "./http/invoice-autopilot.controller.js";
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
import { PrismaAutopilotCoverageReader } from "./infrastructure/prisma-autopilot-coverage.reader.js";
import { AutopilotCoverageReader } from "./domain/ports/autopilot-coverage.reader.js";
import { IssueMonthlyInvoicesHandler } from "./application/commands/issue-monthly-invoices.handler.js";
import { RunInvoiceAutopilotHandler } from "./application/commands/run-invoice-autopilot.handler.js";
import { GetMonthlyInvoicesHandler } from "./application/queries/get-monthly-invoices.handler.js";
import { BusAutomaticMonthlyInvoicer } from "./application/services/bus-automatic-monthly-invoicer.js";
import { AutomaticMonthlyInvoicer } from "./domain/ports/automatic-monthly-invoicer.js";
import { InvoiceAutopilotRuns } from "./domain/ports/invoice-autopilot-runs.js";
import { MonthlyInvoiceOutcomes } from "./domain/ports/monthly-invoice-outcomes.js";
import { MonthlyInvoicesReader } from "./domain/ports/monthly-invoices.reader.js";
import { ClosureBatchesReader } from "./domain/ports/closure-batches.reader.js";
import { MonthlyInvoicingReader } from "./domain/ports/monthly-invoicing.reader.js";
import { AdminCardInvoicesController } from "./http/admin-card-invoices.controller.js";
import { AdminInvoiceSpecimenController } from "./http/admin-invoice-specimen.controller.js";
import { AdminSepaMandateSpecimensController } from "./http/admin-sepa-mandate-specimens.controller.js";
import { AdminMonthlyInvoicesController } from "./http/admin-monthly-invoices.controller.js";
import { AdminUnconfirmedDeliveriesController } from "./http/admin-unconfirmed-deliveries.controller.js";
import { PrismaInvoiceAutopilotRuns } from "./infrastructure/prisma-invoice-autopilot-runs.js";
import { PrismaMonthlyInvoiceOutcomes } from "./infrastructure/prisma-monthly-invoice-outcomes.js";
import { PrismaMonthlyInvoicesReader } from "./infrastructure/prisma-monthly-invoices.reader.js";
import { PrismaClosureBatchesReader } from "./infrastructure/prisma-closure-batches.reader.js";
import { PrismaMonthlyInvoicingReader } from "./infrastructure/prisma-monthly-invoicing.reader.js";
import { InvoicingFloorReader } from "./domain/ports/invoicing-floor.reader.js";
import { PrismaInvoicingFloorReader } from "./infrastructure/prisma-invoicing-floor.reader.js";
import { AdminDetachedUnpaidController } from "./http/admin-detached-unpaid.controller.js";
import { CompanyDetachedUnpaidController } from "./http/company-detached-unpaid.controller.js";
import { DetachedUnpaidReader } from "./domain/ports/detached-unpaid.reader.js";
import { UnpaidAccessReader } from "./domain/ports/unpaid-access.reader.js";
import { PrismaDetachedUnpaidReader } from "./infrastructure/prisma-detached-unpaid.reader.js";
import { PrismaUnpaidAccessReader } from "./infrastructure/prisma-unpaid-access.reader.js";
import { GetDetachedUnpaidOrdersHandler } from "./application/queries/get-detached-unpaid-orders.handler.js";
import { GetMyDetachedUnpaidOrdersHandler } from "./application/queries/get-my-detached-unpaid-orders.handler.js";
import { PrismaCollectionBatchReader } from "./infrastructure/prisma-collection-batch.reader.js";
import { PrismaLotDebtorsReader } from "./infrastructure/prisma-lot-debtors.reader.js";
import { LotDebtorsReader } from "./domain/ports/lot-debtors.reader.js";
import { PrismaCollectionBatchRepository } from "./infrastructure/prisma-collection-batch.repository.js";
import { PrismaCollectionCandidatesReader } from "./infrastructure/prisma-collection-candidates.reader.js";
import { PrismaCollectionLock } from "./infrastructure/prisma-collection-lock.js";
import { PrismaCollectionBatchLock } from "./infrastructure/prisma-collection-batch-lock.js";
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
import { SetInvoicePaymentTermsHandler } from "./application/commands/set-invoice-payment-terms.handler.js";
import { SetInvoicePrefixHandler } from "./application/commands/set-invoice-prefix.handler.js";
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
import { GetSepaMandateSpecimenHandler } from "./application/queries/get-sepa-mandate-specimen.handler.js";
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
import { AccountOrderEngaging } from "./application/services/account-order-engaging.js";
import { AccountOrderRevaluing } from "./application/services/account-order-revaluing.js";
import { OrderEngagementReader } from "./domain/ports/order-engagement.reader.js";
import { OrderRowsLock } from "./domain/ports/order-rows-lock.js";
import { PrismaOrderEngagementReader } from "./infrastructure/prisma-order-engagement.reader.js";
import { PrismaOrderRowsLock } from "./infrastructure/prisma-order-rows-lock.js";

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
 * l'appelle dans sa transaction (plan `restes-du-mandat.md`, lot B) ;
 * elle ne reçoit pas pour autant le droit de charger l'entité.
 *
 * `DocumentStore` n'est pas déclaré ici : il vient de `ContextModule`, qui est
 * `@Global` et décide du bucket à la racine de composition. Un contexte métier
 * ne choisit pas le bucket dans lequel il écrit.
 */
@Module({
  controllers: [
    AdminCollectionReturnsController,
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
    AdminMandateBankExportsController,
    CollectionAutopilotController,
    InvoiceAutopilotController,
    AdminMonthlyInvoicesController,
    AdminUnconfirmedDeliveriesController,
    AdminCardInvoicesController,
    AdminInvoiceSpecimenController,
    AdminSepaMandateSpecimensController,
    AdminBillingStatementsController,
    AdminDetachedUnpaidController,
    CompanyDetachedUnpaidController,
    AdminIssuedInvoicesController,
    CompanyInvoicesController,
    ...BILLING_MODE_CONTROLLERS,
    ...COLLECTION_PROCEDURE_CONTROLLERS,
    ...COLLECTION_TEST_CONTROLLERS,
    ...ACCOUNT_BANK_EXPORT_CONTROLLERS,
  ],
  providers: [
    { provide: LegalEntityRepository, useClass: PrismaLegalEntityRepository },
    { provide: LegalEntityReader, useClass: PrismaLegalEntityReader },
    { provide: CreditorReader, useClass: PrismaCreditorReader },
    { provide: BillableOrdersReader, useClass: PrismaBillableOrdersReader },
    { provide: CycleOrdersReader, useClass: PrismaCycleOrdersReader },
    // Le dossier de facturation simulé (plan `simulateur-dossier-de-facturation.md`).
    { provide: InvoiceDossierReader, useClass: PrismaInvoiceDossierReader },
    { provide: StatementBillingReader, useClass: PrismaStatementBillingReader },
    { provide: LegalEntityLogoReader, useClass: PrismaLegalEntityLogoReader },
    { provide: FirstMandateLedger, useClass: PrismaFirstMandateLedger },
    // Le lot de prélèvement figé (plan `lot-de-prelevement-fige.md`).
    { provide: CollectionCandidatesReader, useClass: PrismaCollectionCandidatesReader },
    // Le compte des clients rejoue le lot avec SES lectures (prelevement-sepa § 12 bis).
    { provide: CountedLotInputsReader, useExisting: CollectionCandidatesReader },
    { provide: CollectionCalendarReader, useExisting: CollectionCandidatesReader },
    { provide: RecordedClosureReader, useClass: PrismaRecordedClosureReader },
    { provide: CollectionBatchRepository, useClass: PrismaCollectionBatchRepository },
    { provide: OrderCollectionRepository, useClass: PrismaOrderCollectionRepository },
    { provide: CollectionBatchReader, useClass: PrismaCollectionBatchReader },
    // Les débiteurs des lots, pour l'onglet 3 de la procédure (P4 révisé).
    { provide: LotDebtorsReader, useClass: PrismaLotDebtorsReader },
    { provide: CollectionLock, useClass: PrismaCollectionLock },
    { provide: CollectionBatchLock, useClass: PrismaCollectionBatchLock },
    // L'arrêté de facturation figé (plan `le-prelevement-suit-la-facture.md`).
    { provide: BillingStatementRepository, useClass: PrismaBillingStatementRepository },
    { provide: StatementBuyerReader, useClass: PrismaStatementBuyerReader },
    { provide: InvoiceIssuersReader, useClass: PrismaInvoiceIssuersReader },
    { provide: BillingStatementReader, useClass: PrismaBillingStatementReader },
    { provide: CancelledOrdersReader, useClass: PrismaCancelledOrdersReader },
    // L'annulation d'une commande au compte (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
    // C5) : l'ordre unique des verrous de lignes, et la réponse à la commande.
    { provide: OrderRowsLock, useClass: PrismaOrderRowsLock },
    { provide: OrderEngagementReader, useClass: PrismaOrderEngagementReader },
    AccountOrderEngaging,
    AccountOrderRevaluing,
    { provide: OrderNumbersReader, useClass: PrismaOrderNumbersReader },
    // La facture émise (plan `facture-emise.md`).
    { provide: InvoiceNumbering, useClass: PrismaInvoiceNumbering },
    { provide: InvoiceRepository, useClass: PrismaInvoiceRepository },
    { provide: InvoiceReader, useClass: PrismaInvoiceReader },
    InvoiceIssuer,
    // La facture du mois, et le lot qui encaisse des factures (E4).
    { provide: MonthlyInvoicingReader, useClass: PrismaMonthlyInvoicingReader },
    { provide: InvoicingFloorReader, useClass: PrismaInvoicingFloorReader },
    { provide: MonthlyInvoiceOutcomes, useClass: PrismaMonthlyInvoiceOutcomes },
    { provide: MonthlyInvoicesReader, useClass: PrismaMonthlyInvoicesReader },
    { provide: ClosureBatchesReader, useClass: PrismaClosureBatchesReader },
    { provide: InvoiceAutopilotRuns, useClass: PrismaInvoiceAutopilotRuns },
    { provide: AutomaticMonthlyInvoicer, useClass: BusAutomaticMonthlyInvoicer },
    IssueMonthlyInvoicesHandler,
    RunInvoiceAutopilotHandler,
    GetMonthlyInvoicesHandler,
    // L'avis de prélèvement (plan `prelevement-automatique.md`, PA2).
    { provide: CollectionNoticeRepository, useClass: PrismaCollectionNoticeRepository },
    { provide: CycleNoticesReader, useClass: PrismaCycleNoticesReader },
    { provide: BatchNoticeStatesReader, useClass: PrismaBatchNoticeStatesReader },
    { provide: PayerNoticeContactsReader, useClass: PrismaPayerNoticeContactsReader },
    CollectionNoticeSender,
    SendCollectionNotice,
    ...ISSUED_INVOICE_PROVIDERS,
    ...CARD_INVOICE_PROVIDERS,
    ...DELIVERY_DAY_PROVIDERS,
    ...BILLING_MODE_PROVIDERS,
    ...MANDATE_BANK_EXPORT_PROVIDERS,
    ...COLLECTION_PROCEDURE_PROVIDERS,
    ...ACCOUNT_BANK_EXPORT_PROVIDERS,
    ...COLLECTION_RETURN_PROVIDERS,
    // Le prélèvement d'essai et nos établissements (plan `plan-prelevement-d-essai.md`).
    ...COLLECTION_TEST_PROVIDERS,
    // La constitution automatique (PA3).
    { provide: CollectionAutopilotRuns, useClass: PrismaCollectionAutopilotRuns },
    { provide: LastAutopilotRunReader, useClass: PrismaLastAutopilotRunReader },
    { provide: AutopilotCoverageReader, useClass: PrismaAutopilotCoverageReader },
    { provide: AutoCollectionEntitiesReader, useClass: PrismaAutoCollectionEntitiesReader },
    { provide: AutomaticCollectionConstituter, useClass: BusAutomaticCollectionConstituter },
    RunCollectionAutopilotHandler,
    // Les impayés d'un site détaché (sous-comptes §2.1 quater).
    { provide: DetachedUnpaidReader, useClass: PrismaDetachedUnpaidReader },
    { provide: UnpaidAccessReader, useClass: PrismaUnpaidAccessReader },
    GetDetachedUnpaidOrdersHandler,
    GetMyDetachedUnpaidOrdersHandler,
    ConstituteCollectionBatchesHandler,
    CollectionAssemblyReaders,
    ConstitutionNoticeReaders,
    ConstitutionWriters,
    CancelCollectionBatchHandler,
    RecordCollectionBatchDownloadHandler,
    DepositCollectionBatchHandler,
    RejectCollectionBatchByBankHandler,
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
    SetInvoicePaymentTermsHandler,
    SetInvoicePrefixHandler,
    SetLegalEntityArchivedHandler,
    SetLegalEntityLogoHandler,
    RemoveLegalEntityLogoHandler,
    ListLegalEntitiesHandler,
    GetLegalEntityHandler,
    GetMandateSchemeUsageHandler,
    ExportSampleMandateHandler,
    GetSepaMandateSpecimenHandler,
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
  // `AccountOrderEngaging` sort pour la commande, qui le reçoit sous SES
  // tokens (`appBootstrap/account-order-engagement.module.ts`).
  exports: [
    CreditorReader,
    LegalEntityLogoReader,
    FirstMandateLedger,
    AccountOrderEngaging,
    AccountOrderRevaluing,
  ],
})
export class AccountingModule {}
