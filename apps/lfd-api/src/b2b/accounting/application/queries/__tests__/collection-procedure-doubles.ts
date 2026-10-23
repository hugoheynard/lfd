import { addDays, instantToLocal, type CollectionExclusionView } from "@lfd/contracts";

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
