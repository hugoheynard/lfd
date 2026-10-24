import { addDays, instantToLocal, type CollectionExclusionView } from "@lfd/contracts";

import {
  AutopilotCoverageReader,
  type AutopilotCoverage,
} from "../../../domain/ports/autopilot-coverage.reader.js";
import {
  CollectionBatchReader,
  type StoredBatchFile,
  type StoredBatchView,
} from "../../../domain/ports/collection-batch.reader.js";
import {
  CollectionReturnsReader,
  type CollectionReturnRow,
} from "../../../domain/ports/collection-returns.reader.js";
import type { BatchCsvLine } from "../../../domain/services/collection-batch-csv.js";
import { BankReturnChecksReader } from "../../../domain/ports/bank-return-checks.reader.js";
import type { BankReturnCheckLine } from "../../../domain/services/bank-return-checks.js";
import { LotDebtorsReader } from "../../../domain/ports/lot-debtors.reader.js";
import type { LotDebtorLine } from "../../../domain/services/lot-debtor-bank-standing.js";
import { NOW } from "../../commands/__tests__/account-bank-export-doubles.js";

/**
 * Les lots et les retours de la procédure, doublés pour sa lecture et pour sa
 * liste. Les jours des lots sont RELATIFS à l'horloge fixe ; seule la clôture
 * est écrite, et elle n'est comparée qu'au calendrier de l'horloge fixe.
 */
export const TODAY = instantToLocal(NOW).day;
/** La dernière clôture mensuelle avant `NOW` (le 1er du mois, minuit de Paris). */
export const LAST_CLOSURE = "2026-09-30T22:00:00.000Z";

export function stored(id: string, over: Partial<StoredBatchView> = {}): StoredBatchView {
  return {
    id,
    scheme: "B2B",
    cycleStartsAt: "2026-08-31T22:00:00.000Z",
    cycleClosesAt: LAST_CLOSURE,
    periodLabel: "du 1er au 30 septembre 2026",
    status: "constituted",
    constitutedAt: NOW.toISOString(),
    constitutedBy: "staff",
    depositedAt: null,
    cancelledAt: null,
    rejection: null,
    lastDownloadedAt: null,
    lineCount: 1,
    orderCount: 1,
    totalCents: 10_000,
    unmandatedCompanies: [],
    depositable: true,
    requestedCollectionDay: addDays(TODAY, 10),
    postponedFromDay: null,
    depositDeadline: { day: addDays(TODAY, 6), time: "13:45" },
    lines: [],
    payerRefs: [],
    ...over,
  };
}

export class FixedBatches extends CollectionBatchReader {
  batches: StoredBatchView[] = [];
  list(): Promise<readonly StoredBatchView[]> {
    return Promise.resolve(this.batches);
  }
  exclusions(): Promise<readonly CollectionExclusionView[]> {
    return Promise.resolve([]);
  }
  file(): Promise<StoredBatchFile | null> {
    return Promise.resolve(null);
  }
  auditLines(): Promise<readonly BatchCsvLine[]> {
    return Promise.resolve([]);
  }
}

export class PendingReturns extends CollectionReturnsReader {
  readonly pending = new Map<string, number>();
  ofBatch(batchId: string): Promise<readonly CollectionReturnRow[]> {
    const count = this.pending.get(batchId) ?? 0;
    return Promise.resolve(
      Array.from({ length: count }, (_, index) => pendingReturn(batchId, index)),
    );
  }
  ofPayer(): Promise<readonly CollectionReturnRow[]> {
    return Promise.resolve([]);
  }
}

function pendingReturn(batchId: string, index: number): CollectionReturnRow {
  return {
    id: `ret_${String(index)}`,
    endToEndId: `e2e_${String(index)}`,
    batchId,
    lineRank: 1,
    scheme: "B2B",
    cycleClosesAt: new Date(LAST_CLOSURE),
    debtorCompanyId: "cmp",
    debtorName: "Café",
    mandateId: "m1",
    mandateReference: "RUM-m1",
    kind: "reject",
    reasonCode: "AM04",
    reasonLabel: null,
    returnedOn: TODAY,
    amountCents: 10_000,
    feeCents: null,
    source: "manual",
    recordedAt: NOW,
    resolution: "pending",
    resolutionNote: null,
    resolvedAt: null,
  };
}

/**
 * La couverture de l'automatisme : sans tentative, rien n'est manqué. Les
 * tentatives sont des clôtures, comparées au calendrier de l'horloge fixe.
 */
export class FixedCoverage extends AutopilotCoverageReader {
  attempted: Date[] = [];
  lastLiveBatchClosesAt: Date | null = null;
  coverageOf(_legalEntityId: string, before: Date): Promise<AutopilotCoverage> {
    return Promise.resolve({
      floorAt: null,
      attemptedClosures: this.attempted.filter((closure) => closure < before),
      lastLiveBatchClosesAt: this.lastLiveBatchClosesAt,
    });
  }
}

/** Les lignes « Retours contrôlés » de l'entité, écrites à la main. */
export class FixedBankReturnChecks extends BankReturnChecksReader {
  lines: BankReturnCheckLine[] = [];
  ofEntity(): Promise<readonly BankReturnCheckLine[]> {
    return Promise.resolve(this.lines);
  }

  /** Atteste ces jours, au nom de `staff_1`. */
  attest(...days: readonly string[]): void {
    for (const day of days) {
      this.lines.push({ id: `chk_${day}`, day, at: NOW, staffId: "staff_1", withdrawn: false });
    }
  }
}

/** Les débiteurs des lots — le mur rejoue le filtre par lot demandé. */
export class FixedLotDebtors extends LotDebtorsReader {
  lines: LotDebtorLine[] = [];
  ofBatches(
    _legalEntityId: string,
    batchIds: readonly string[],
  ): Promise<readonly LotDebtorLine[]> {
    return Promise.resolve(this.lines.filter((line) => batchIds.includes(line.batchId)));
  }
}

/** Une ligne de lot portée par le mandat `bankMandate(mandateId)`. */
export function lotDebtor(batchId: string, mandateId: string): LotDebtorLine {
  return {
    batchId,
    scheme: "B2B",
    mandateId,
    mandateReference: `RUM-${mandateId}`,
    debtorName: `Société ${mandateId}`,
  };
}
