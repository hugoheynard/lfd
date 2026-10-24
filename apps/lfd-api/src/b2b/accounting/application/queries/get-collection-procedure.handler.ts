import {
  instantToLocal,
  type CollectionProcedureView,
  type CollectionProcedureBatchView,
  type CollectionProcedureToPrepareView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { BankReturnChecksReader } from "../../domain/ports/bank-return-checks.reader.js";
import { CollectionBatchAttestationsReader } from "../../domain/ports/collection-batch-attestations.reader.js";
import {
  attestationsViewOf,
  readProcedureAttestations,
} from "../collection-procedure-attestations-support.js";
import { checkedDaysOf } from "../../domain/services/bank-return-checks.js";
import { readReturnsStep } from "../collection-procedure-returns-support.js";
import { CollectionBatchNotFoundError } from "../../domain/errors/collection-errors.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { AutopilotCoverageReader } from "../../domain/ports/autopilot-coverage.reader.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { LotDebtorsReader } from "../../domain/ports/lot-debtors.reader.js";
import { CollectionReturnsReader } from "../../domain/ports/collection-returns.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  KnownMandateAccountsReader,
  MandateBankExportsReader,
} from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CountedLotInputsReader } from "../../domain/ports/counted-lot-inputs.reader.js";
import { PayerStandingsReader } from "../../domain/ports/payer-standings.reader.js";
import { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import { payerCountsAt } from "../../domain/services/rhythm-payer-counts.js";
import { closureDayOf } from "../../domain/services/collection-procedure-id.js";
import {
  arrivalStepOf,
  followedAtClosure,
  followedBatchOf,
  openBatchesOf,
  replacementOf,
  type ProcedureBatch,
} from "../../domain/services/collection-procedure.js";
import {
  procedureBatchesOf,
  procedureBatchView,
  readBankSteps,
  toPrepareOf,
} from "../collection-procedure-support.js";
import { fileStep, readDebtorsNotImported } from "../collection-procedure-file-support.js";
import { batchesOfClosure, procedureIdentityOf } from "../collection-procedure-identity-support.js";
import { countedPayerIdsOf } from "../counted-payers-support.js";
import { readBillingDates } from "../invoicing-calendar-support.js";
import { lotModesByClosureDay, procedureRhythmsOf } from "../procedure-rhythms-support.js";
import { readMissedProcedure } from "../missed-closures-support.js";
import { readLotPayerModes } from "../lot-payer-modes-support.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { GetCollectionProcedureQuery } from "./collection-procedure-queries.js";
import { isDeadBatchStatus } from "../../domain/entities/collection-batch-status.js";

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
    private readonly known: KnownMandateAccountsReader,
    private readonly exports: MandateBankExportsReader,
    private readonly batches: CollectionBatchReader,
    private readonly returns: CollectionReturnsReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly coverage: AutopilotCoverageReader,
    private readonly standings: PayerStandingsReader,
    private readonly collectionMandates: CollectionMandatesReader,
    private readonly lotInputs: CountedLotInputsReader,
    private readonly clock: Clock,
    private readonly checks: BankReturnChecksReader,
    private readonly authors: StaffAuthorDirectory,
    private readonly lotDebtors: LotDebtorsReader,
    private readonly attestations: CollectionBatchAttestationsReader,
  ) {}

  async execute(query: GetCollectionProcedureQuery): Promise<CollectionProcedureView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const now = this.clock.now();
    const today = instantToLocal(now).day;
    const [bank, stored, dates, payerIds, checks] = await Promise.all([
      readBankSteps(
        {
          accounts: this.accounts,
          fingerprints: this.fingerprints,
          mandates: this.mandates,
          known: this.known,
          exports: this.exports,
        },
        entity.id,
      ),
      this.batches.list(entity.id),
      readBillingDates({ modeDates: this.modeDates, payerModes: this.payerModes }, entity.id),
      countedPayerIdsOf(
        { standings: this.standings, mandates: this.collectionMandates, lot: this.lotInputs },
        entity.id,
        now,
      ),
      this.checks.ofEntity(entity.id),
    ]);
    const calendar = InvoicingCalendar.of(dates.modes, dates.payers);
    const attested = await readProcedureAttestations(
      { attestations: this.attestations, authors: this.authors },
      stored.map((batch) => batch.id),
    );
    const [batches, modes, missed] = await Promise.all([
      procedureBatchesOf(this.returns, stored, checkedDaysOf(checks), attested.lines),
      readLotPayerModes(
        this.periods,
        calendar,
        stored.map((batch) => ({
          payerRefs: batch.payerRefs,
          closesAt: new Date(batch.cycleClosesAt),
        })),
      ),
      readMissedProcedure(this.coverage, entity.id, calendar, query.closureDay, now),
    ]);
    const toPrepare = pinnedToPrepare(toPrepareOf(entity.id, calendar, stored, now), query);
    const followed = followedOf(query, batches, today, toPrepare !== null);
    const views = new Map(
      stored.map((batch, index) => [
        batch.id,
        procedureBatchView(
          entity.id,
          batch,
          modes[index] ?? [],
          attestationsViewOf(attested.views, batch.id),
        ),
      ]),
    );
    const storedById = new Map(stored.map((batch) => [batch.id, batch]));
    const closureDay = procedureDayOf(query, followed, toPrepare);
    const ofClosure = closureDay === null ? [] : batchesOfClosure(stored, closureDay);
    const procedureBatches = batches.filter((batch) =>
      ofClosure.some((row) => row.id === batch.id),
    );
    const { accounts, mandates } = bank;
    const debtorsNotImported = await readDebtorsNotImported(
      this.lotDebtors,
      entity.id,
      followed === null ? procedureBatches : [followed, ...procedureBatches],
      bank.standing,
    );
    const file = fileStep(
      { followed, toPrepare: toPrepare !== null, accounts, mandates, debtorsNotImported },
      storedById,
    );
    const returns = await readReturnsStep(
      { returns: this.returns, authors: this.authors },
      {
        followed,
        lineCount: followed === null ? null : (storedById.get(followed.id)?.lines.length ?? 0),
        checks,
        today,
      },
    );
    const replacement =
      followed !== null && isDeadBatchStatus(followed.status)
        ? replacementOf(followed, batches)
        : null;
    return {
      legalEntityId: entity.id,
      procedure:
        closureDay === null
          ? null
          : await procedureIdentityOf(
              this.periods,
              calendar,
              closureDay,
              ofClosure,
              procedureRhythmsOf(
                calendar,
                lotModesByClosureDay(stored, modes),
                payerCountsAt(dates.modes, dates.payers, payerIds, now),
              ),
            ),
      procedureBatches: viewsOf(views, procedureBatches),
      followed: viewsOf(views, followed === null ? [] : [followed])[0] ?? null,
      replacementBatchId: replacement?.id ?? null,
      toPrepare,
      missed,
      openBatches: viewsOf(views, openBatchesOf(batches, today)),
      accounts,
      mandates,
      file,
      returns,
      arrivalStep: arrivalStepOf({
        accounts: accounts.state,
        mandates: mandates.state,
        file: file.state,
        returns: returns.state,
      }),
    };
  }
}

/**
 * La clôture à préparer, seulement si c'est celle de la procédure ouverte :
 * « Préparer » ne prépare que la dernière clôture, et une procédure à venir
 * n'a rien à préparer encore.
 */
function pinnedToPrepare(
  toPrepare: CollectionProcedureToPrepareView | null,
  query: GetCollectionProcedureQuery,
): CollectionProcedureToPrepareView | null {
  if (toPrepare === null || query.closureDay === null) {
    return toPrepare;
  }
  return closureDayOf(new Date(toPrepare.closesAt)) === query.closureDay ? toPrepare : null;
}

/** Le jour de la procédure ouverte : celui de l'adresse, sinon du lot suivi, sinon de la clôture à préparer. */
function procedureDayOf(
  query: GetCollectionProcedureQuery,
  followed: ProcedureBatch | null,
  toPrepare: CollectionProcedureToPrepareView | null,
): string | null {
  if (query.closureDay !== null) {
    return query.closureDay;
  }
  if (followed !== null) {
    return closureDayOf(new Date(followed.cycleClosesAt));
  }
  return toPrepare === null ? null : closureDayOf(new Date(toPrepare.closesAt));
}

/** Le lot de l'adresse ; sinon celui de la clôture ouverte ; sinon la règle du § 4.3. */
function followedOf(
  query: GetCollectionProcedureQuery,
  batches: readonly ProcedureBatch[],
  today: string,
  toPrepare: boolean,
): ProcedureBatch | null {
  if (query.batchId !== null) {
    return requestedBatch(batches, query.batchId);
  }
  const day = query.closureDay;
  if (day === null) {
    return followedBatchOf(batches, today, toPrepare);
  }
  const ofClosure = batches.filter((batch) => closureDayOf(new Date(batch.cycleClosesAt)) === day);
  return followedAtClosure(ofClosure, today, toPrepare);
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
