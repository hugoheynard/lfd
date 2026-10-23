import {
  instantToLocal,
  type CollectionProcedureFileView,
  type CollectionProcedureMandatesView,
  type CollectionProcedureView,
  type CollectionProcedureAccountsView,
  type CollectionProcedureBatchView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CollectionBatchNotFoundError } from "../../domain/errors/collection-errors.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import {
  CollectionBatchReader,
  type StoredBatchView,
} from "../../domain/ports/collection-batch.reader.js";
import { CollectionReturnsReader } from "../../domain/ports/collection-returns.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
} from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { tightDepositMargin } from "../../domain/services/collection-calendar.js";
import {
  arrivalStepOf,
  fileStatus,
  followedBatchOf,
  openBatchesOf,
  replacementOf,
  returnsStatus,
  type ProcedureBatch,
} from "../../domain/services/collection-procedure.js";
import {
  procedureBatchesOf,
  procedureBatchView,
  readAccountsStep,
  readMandatesStep,
  toPrepareOf,
} from "../collection-procedure-support.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { readLotPayerModes } from "../lot-payer-modes-support.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { GetCollectionProcedureQuery } from "./collection-procedure-queries.js";

/**
 * **La procédure de prélèvement** (S1) : l'état des quatre onglets, calculé
 * à chaque lecture depuis les exports, les lots et les retours — la page
 * n'en garde aucune mémoire (plan `plan-page-procedure-de-prelevement.md`,
 * § 1). Une lecture : rien n'est écrit.
 *
 * Les onglets 1 et 2 passent par la même sélection que leurs cartes, le lot
 * suivi par la règle du § 4.3 (la limite de dépôt la plus proche d'abord).
 */
@QueryHandler(GetCollectionProcedureQuery)
export class GetCollectionProcedureHandler implements IQueryHandler<
  GetCollectionProcedureQuery,
  CollectionProcedureView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly accounts: AccountsForBankExportReader,
    private readonly fingerprints: KnownAccountFingerprintsReader,
    private readonly mandates: MandatesForBankExportReader,
    private readonly imported: ImportedMandateAccountsReader,
    private readonly exports: MandateBankExportsReader,
    private readonly batches: CollectionBatchReader,
    private readonly returns: CollectionReturnsReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetCollectionProcedureQuery): Promise<CollectionProcedureView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const now = this.clock.now();
    const today = instantToLocal(now).day;
    const accounts = await readAccountsStep(
      { accounts: this.accounts, fingerprints: this.fingerprints },
      entity.id,
    );
    const [mandates, stored, calendar] = await Promise.all([
      readMandatesStep(
        { mandates: this.mandates, imported: this.imported, exports: this.exports },
        entity.id,
        accounts,
      ),
      this.batches.list(entity.id),
      readInvoicingCalendar({ modeDates: this.modeDates, payerModes: this.payerModes }, entity.id),
    ]);
    const [batches, modes] = await Promise.all([
      procedureBatchesOf(this.returns, stored),
      readLotPayerModes(
        this.periods,
        calendar,
        stored.map((batch) => ({
          payerRefs: batch.payerRefs,
          closesAt: new Date(batch.cycleClosesAt),
        })),
      ),
    ]);
    const toPrepare = toPrepareOf(calendar, stored, now);
    const followed =
      query.batchId === null
        ? followedBatchOf(batches, today, toPrepare !== null)
        : requestedBatch(batches, query.batchId);
    const views = new Map(
      stored.map((batch, index) => [batch.id, procedureBatchView(batch, modes[index] ?? [])]),
    );
    const storedById = new Map(stored.map((batch) => [batch.id, batch]));
    const file = fileStep(followed, toPrepare !== null, storedById, accounts, mandates);
    const returns = returnsStatus(followed, today);
    const replacement = followed?.status === "cancelled" ? replacementOf(followed, batches) : null;
    return {
      legalEntityId: entity.id,
      followed: viewsOf(views, followed === null ? [] : [followed])[0] ?? null,
      replacementBatchId: replacement?.id ?? null,
      toPrepare,
      openBatches: viewsOf(views, openBatchesOf(batches, today)),
      accounts,
      mandates,
      file,
      returns: { ...returns, pendingReturnCount: followed?.pendingReturnCount ?? 0 },
      arrivalStep: arrivalStepOf({
        accounts: accounts.state,
        mandates: mandates.state,
        file: file.state,
        returns: returns.state,
      }),
    };
  }
}

/** Le lot de l'adresse, ou un 404 qui le nomme — un lot d'une autre entité n'existe pas ici. */
function requestedBatch(batches: readonly ProcedureBatch[], batchId: string): ProcedureBatch {
  const found = batches.find((batch) => batch.id === batchId);
  if (found === undefined) {
    throw new CollectionBatchNotFoundError(batchId);
  }
  return found;
}

/** Les lots tels que la tête de la page les liste, dans l'ordre donné. */
function viewsOf(
  views: ReadonlyMap<string, CollectionProcedureBatchView>,
  batches: readonly ProcedureBatch[],
): readonly CollectionProcedureBatchView[] {
  return batches.flatMap((batch) => {
    const view = views.get(batch.id);
    return view === undefined ? [] : [view];
  });
}

/**
 * L'onglet 3 et ses avertissements. Les mandats non importés sont ceux de
 * l'ENTITÉ : sans S2 (P4), on ne sait pas lesquels sont du lot.
 */
function fileStep(
  followed: ProcedureBatch | null,
  toPrepare: boolean,
  views: ReadonlyMap<string, StoredBatchView>,
  accounts: CollectionProcedureAccountsView,
  mandates: CollectionProcedureMandatesView,
): CollectionProcedureFileView {
  const stored = followed === null ? undefined : views.get(followed.id);
  return {
    ...fileStatus(followed, toPrepare),
    mandatesNotImportedCount: mandates.toExportCount,
    excludedMandateCount: mandates.excludedCount,
    excludedAccountCount: accounts.excludedCount,
    tightDepositMargin:
      stored?.status === "constituted"
        ? tightDepositMargin(
            instantToLocal(new Date(stored.constitutedAt)).day,
            stored.depositDeadline,
          )
        : null,
  };
}
