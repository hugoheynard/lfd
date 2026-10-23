import {
  addDays,
  instantToLocal,
  type CollectionProcedureAccountsView,
  type CollectionProcedureListView,
  type CollectionProcedureMandatesView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { AutopilotCoverageReader } from "../../domain/ports/autopilot-coverage.reader.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import {
  CollectionBatchReader,
  type StoredBatchView,
} from "../../domain/ports/collection-batch.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CountedLotInputsReader } from "../../domain/ports/counted-lot-inputs.reader.js";
import { CollectionReturnsReader } from "../../domain/ports/collection-returns.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  KnownMandateAccountsReader,
  MandateBankExportsReader,
} from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerStandingsReader } from "../../domain/ports/payer-standings.reader.js";
import {
  procedureRowsOf,
  type ListedBatch,
} from "../../domain/services/collection-procedure-list.js";
import { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import { isRhythmFollowed, payerCountsAt } from "../../domain/services/rhythm-payer-counts.js";
import { BILLING_MODES, type BillingMode } from "../../domain/value-objects/billing-mode.js";
import { collectionSettingsOf } from "../collection-calendar-settings-support.js";
import {
  closureToCome,
  listedBatchesOf,
  procedureRowView,
  upcomingClosures,
} from "../collection-procedure-list-support.js";
import {
  procedureBatchesOf,
  readAccountsStep,
  readMandatesStep,
  toPrepareOf,
} from "../collection-procedure-support.js";
import { countedPayerIdsOf } from "../counted-payers-support.js";
import { readBillingDates } from "../invoicing-calendar-support.js";
import { missedClosuresToCome } from "../missed-closures-support.js";
import { readLotPayerModes } from "../lot-payer-modes-support.js";
import { lotModesByClosureDay, procedureRhythmsOf } from "../procedure-rhythms-support.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { ListCollectionProceduresQuery } from "./collection-procedure-queries.js";

/** « Afficher les closes » : les trois derniers mois. */
export const CLOSED_PROCEDURES_LOOKBACK_DAYS = 92;

/**
 * **La liste des procédures de prélèvement** (plan
 * `plan-page-procedure-de-prelevement.md`, § 11) : une ligne par clôture —
 * manquées, ouvertes, prochaine clôture de chaque rythme suivi, closes récentes.
 *
 * Les mêmes lectures que la procédure (onglets 1 et 2, lots et retours,
 * clôture à préparer), le même suivi des rythmes que leur tableau de bord ;
 * l'état de chaque ligne vient des règles de la procédure. Rien n'est écrit.
 */
@QueryHandler(ListCollectionProceduresQuery)
export class ListCollectionProceduresHandler implements IQueryHandler<
  ListCollectionProceduresQuery,
  CollectionProcedureListView
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
    private readonly standings: PayerStandingsReader,
    private readonly collectionMandates: CollectionMandatesReader,
    private readonly lotInputs: CountedLotInputsReader,
    private readonly coverage: AutopilotCoverageReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListCollectionProceduresQuery): Promise<CollectionProcedureListView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const now = this.clock.now();
    const local = instantToLocal(now);
    const [steps, stored, dates, payerIds] = await Promise.all([
      this.readSteps(entity.id),
      this.batches.list(entity.id),
      readBillingDates({ modeDates: this.modeDates, payerModes: this.payerModes }, entity.id),
      countedPayerIdsOf(
        { standings: this.standings, mandates: this.collectionMandates, lot: this.lotInputs },
        entity.id,
        now,
      ),
    ]);
    const calendar = InvoicingCalendar.of(dates.modes, dates.payers);
    const settings = collectionSettingsOf(entity);
    const [{ batches, modes }, missed] = await Promise.all([
      this.readBatches(stored, calendar),
      missedClosuresToCome(this.coverage, entity.id, calendar, settings, now),
    ]);
    const counts = payerCountsAt(dates.modes, dates.payers, payerIds, now);
    const rhythmsOf = procedureRhythmsOf(calendar, lotModesByClosureDay(stored, modes), counts);
    const followed = BILLING_MODES.filter((mode) => isRhythmFollowed(mode, counts.get(mode) ?? 0));
    const toPrepare = toPrepareOf(entity.id, calendar, stored, now);
    const toPrepareAt = toPrepare === null ? null : new Date(toPrepare.closesAt);
    const closedSince = query.includeClosed
      ? addDays(local.day, -CLOSED_PROCEDURES_LOOKBACK_DAYS)
      : null;
    const rows = procedureRowsOf({
      legalEntityId: entity.id,
      now: local,
      ...steps,
      batches,
      missed,
      toPrepare:
        toPrepareAt === null
          ? null
          : closureToCome(calendar, toPrepareAt, settings, calendar.modesClosingAt(toPrepareAt)),
      upcoming: upcomingClosures(dates.modes, followed, calendar, settings, now),
      closedSince,
    });
    return {
      legalEntityId: entity.id,
      today: local.day,
      closedSince,
      rows: rows.map((row) => procedureRowView(entity.id, row, rhythmsOf)),
    };
  }

  /** Les onglets 1 et 2 — de l'entité, par la même sélection que leurs cartes. */
  private async readSteps(legalEntityId: string): Promise<{
    readonly accounts: CollectionProcedureAccountsView;
    readonly mandates: CollectionProcedureMandatesView;
  }> {
    const accounts = await readAccountsStep(
      { accounts: this.accounts, fingerprints: this.fingerprints },
      legalEntityId,
    );
    const mandates = await readMandatesStep(
      { mandates: this.mandates, known: this.known, exports: this.exports },
      legalEntityId,
      accounts,
    );
    return { accounts, mandates };
  }

  /** Les lots, leurs retours en suspens et les modes de leurs clients. */
  private async readBatches(
    stored: readonly StoredBatchView[],
    calendar: InvoicingCalendar,
  ): Promise<{
    readonly batches: readonly ListedBatch[];
    readonly modes: readonly (readonly BillingMode[])[];
  }> {
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
    return { batches: listedBatchesOf(stored, batches, modes), modes };
  }
}
