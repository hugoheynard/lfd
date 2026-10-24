import type {
  BillingRhythmKind,
  CollectionProcedureAccountsView,
  CollectionProcedureBatchView,
  CollectionProcedureMandatesView,
  CollectionProcedureToPrepareView,
} from "@lfd/contracts";

import type {
  KnownAccountFingerprints,
  KnownAccountFingerprintsReader,
} from "../domain/ports/account-bank-exports.reader.js";
import type {
  AccountsForBankExport,
  AccountsForBankExportReader,
} from "../domain/ports/accounts-for-bank-export.reader.js";
import type { StoredBatchView } from "../domain/ports/collection-batch.reader.js";
import type { CollectionReturnsReader } from "../domain/ports/collection-returns.reader.js";
import type {
  KnownMandateAccountsReader,
  KnownMandateLines,
  MandateBankExportRecord,
  MandateBankExportsReader,
} from "../domain/ports/mandate-bank-exports.reader.js";
import type {
  MandatesForBankExport,
  MandatesForBankExportReader,
} from "../domain/ports/mandates-for-bank-export.reader.js";
import {
  bankReferentialStandingOf,
  type BankReferentialStanding,
} from "../domain/services/lot-debtor-bank-standing.js";
import { selectAccountsForBankExport } from "../domain/services/account-bank-export-selection.js";
import {
  accountsState,
  mandatesState,
  type ProcedureBatch,
} from "../domain/services/collection-procedure.js";
import { procedureIdOf } from "../domain/services/collection-procedure-id.js";
import type { InvoicingCalendar } from "../domain/services/invoicing-calendar.js";
import { periodLabelOf } from "../domain/services/invoicing-closures.js";
import { selectForBankExport } from "../domain/services/mandate-bank-export-selection.js";
import { isDeadBatchStatus } from "../domain/entities/collection-batch-status.js";

/** Ce que l'onglet 1 lit — les ports de la carte « Comptes à la banque ». */
export interface ProcedureAccountReaders {
  readonly accounts: AccountsForBankExportReader;
  readonly fingerprints: KnownAccountFingerprintsReader;
}

/** Ce que l'onglet 2 lit — les ports de la carte « Mandats à la banque ». */
export interface ProcedureMandateReaders {
  readonly mandates: MandatesForBankExportReader;
  readonly known: KnownMandateAccountsReader;
  readonly exports: MandateBankExportsReader;
}

/** L'onglet 1, par la même sélection que la carte : les deux ne peuvent pas diverger. */
export async function readAccountsStep(
  readers: ProcedureAccountReaders,
  legalEntityId: string,
): Promise<CollectionProcedureAccountsView> {
  const [accounts, fingerprints] = await Promise.all([
    readers.accounts.debitedBy(legalEntityId),
    readers.fingerprints.all(),
  ]);
  return accountsStepOf(accounts, fingerprints);
}

function accountsStepOf(
  { exportable, excluded }: AccountsForBankExport,
  fingerprints: KnownAccountFingerprints,
): CollectionProcedureAccountsView {
  const selection = selectAccountsForBankExport(exportable, fingerprints);
  return {
    state: accountsState(selection.toExport.length, selection.inFlight.length),
    toExportCount: selection.toExport.length,
    inFlightCount: selection.inFlight.length,
    excludedCount: excluded.length,
  };
}

/**
 * L'onglet 2, par la même sélection que la carte. « En attente » se lit sur
 * un export ni importé ni abandonné (P1).
 */
export async function readMandatesStep(
  readers: ProcedureMandateReaders,
  legalEntityId: string,
  accounts: CollectionProcedureAccountsView,
): Promise<CollectionProcedureMandatesView> {
  const [mandates, known, exports] = await Promise.all([
    readers.mandates.activeOf(legalEntityId),
    readers.known.of(legalEntityId),
    readers.exports.list(legalEntityId),
  ]);
  return mandatesStepOf(mandates, known, exports, accounts);
}

function mandatesStepOf(
  { exportable, excluded }: MandatesForBankExport,
  known: KnownMandateLines,
  exports: readonly MandateBankExportRecord[],
  accounts: CollectionProcedureAccountsView,
): CollectionProcedureMandatesView {
  const toExportCount = selectForBankExport(exportable, known).toExport.length;
  const awaitingImport = exports.some((row) => row.importedAt === null && row.abandonedAt === null);
  return {
    state: mandatesState(accounts.state, toExportCount, awaitingImport),
    toExportCount,
    awaitingImport,
    excludedCount: excluded.length,
  };
}

/** Les onglets 1 et 2, et ce que leurs exports disent de chaque mandat. */
export interface ProcedureBankSteps {
  readonly accounts: CollectionProcedureAccountsView;
  readonly mandates: CollectionProcedureMandatesView;
  readonly standing: BankReferentialStanding;
}

/**
 * Les onglets 1 et 2 ET le référentiel de CENET par mandat, sur UNE lecture
 * des ports — l'onglet 3 nomme ses débiteurs sous les mêmes sélections
 * (P4 révisé, 2026-10-24).
 */
export async function readBankSteps(
  readers: ProcedureAccountReaders & ProcedureMandateReaders,
  legalEntityId: string,
): Promise<ProcedureBankSteps> {
  const [accounts, fingerprints, mandates, known, exports] = await Promise.all([
    readers.accounts.debitedBy(legalEntityId),
    readers.fingerprints.all(),
    readers.mandates.activeOf(legalEntityId),
    readers.known.of(legalEntityId),
    readers.exports.list(legalEntityId),
  ]);
  const accountsView = accountsStepOf(accounts, fingerprints);
  return {
    accounts: accountsView,
    mandates: mandatesStepOf(mandates, known, exports, accountsView),
    standing: bankReferentialStandingOf(mandates, known, accounts, fingerprints),
  };
}

/**
 * Les lots de l'entité, chacun avec ses retours en suspens. Seuls les lots
 * DÉPOSÉS en ont : un retour exige un lot déposé (`collection-return.ts`).
 * `checkedDays` : les jours « Retours contrôlés » de l'entité — un contrôle
 * du jour couvre tous ses lots (plan § 3.4).
 */
export async function procedureBatchesOf(
  returns: CollectionReturnsReader,
  stored: readonly StoredBatchView[],
  checkedDays: ReadonlySet<string>,
): Promise<readonly ProcedureBatch[]> {
  return Promise.all(
    stored.map(async (batch): Promise<ProcedureBatch> => {
      const rows = batch.status === "deposited" ? await returns.ofBatch(batch.id) : [];
      return {
        id: batch.id,
        scheme: batch.scheme,
        status: batch.status,
        cycleClosesAt: batch.cycleClosesAt,
        requestedCollectionDay: batch.requestedCollectionDay,
        depositDeadline: batch.depositDeadline,
        pendingReturnCount: rows.filter((row) => row.resolution === "pending").length,
        checkedDays,
      };
    }),
  );
}

/** Le lot tel que la tête de la page le liste. */
export function procedureBatchView(
  legalEntityId: string,
  batch: StoredBatchView,
  payerModes: readonly BillingRhythmKind[],
): CollectionProcedureBatchView {
  return {
    id: batch.id,
    procedureId: procedureIdOf(legalEntityId, new Date(batch.cycleClosesAt)),
    scheme: batch.scheme,
    periodLabel: batch.periodLabel,
    payerModes,
    status: batch.status,
    requestedCollectionDay: batch.requestedCollectionDay,
    depositDeadline: batch.depositDeadline,
    cancelledAt: batch.cancelledAt,
    rejectedAt: batch.rejection?.at ?? null,
  };
}

/**
 * La dernière clôture du calendrier, si aucun lot vivant ne la porte : le lot
 * « à préparer » de l'onglet 3. Même règle que « Prélèvement du mois »
 * (`alreadyPrepared`) — un lot annulé ne compte pas.
 */
export function toPrepareOf(
  legalEntityId: string,
  calendar: InvoicingCalendar,
  stored: readonly StoredBatchView[],
  now: Date,
): CollectionProcedureToPrepareView | null {
  const closure = calendar.lastClosureAtOrBefore(now);
  const prepared = stored.some(
    (batch) =>
      !isDeadBatchStatus(batch.status) &&
      new Date(batch.cycleClosesAt).getTime() === closure.getTime(),
  );
  if (prepared) {
    return null;
  }
  return {
    procedureId: procedureIdOf(legalEntityId, closure),
    closesAt: closure.toISOString(),
    periodLabel: periodLabelOf(calendar.cycleClosedAt(closure)),
  };
}
