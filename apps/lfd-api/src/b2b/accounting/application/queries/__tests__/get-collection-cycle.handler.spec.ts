import type { CollectionExclusionView } from "@lfd/contracts";

import {
  CollectionBatchReader,
  type StoredBatchFile,
  type StoredBatchView,
} from "../../../domain/ports/collection-batch.reader.js";
import type { PayerModeSegments } from "../../../domain/ports/payer-billing-modes.reader.js";
import { paris } from "../../../domain/services/__tests__/billing-mode-fixtures.js";
import type { BatchCsvLine } from "../../../domain/services/collection-batch-csv.js";
import type { LotPayerRef } from "../../../domain/services/lot-payer-modes.js";
import {
  FixedModeDates,
  FixedPayerModes,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { FixedInvoicePeriods } from "../../services/__tests__/issued-invoice-doubles.js";
import { GetCollectionCycleQuery } from "../collection-batch-queries.js";
import { GetCollectionCycleHandler } from "../get-collection-cycle.handler.js";

/**
 * Les modes des clients d'un lot (Hugo, 2026-10-12) : ceux des payeurs
 * PRÉLEVÉS, chacun au mode de la période de sa facture. Les dates ne se
 * comparent qu'entre elles.
 */

const MONDAY = paris("2026-10-05");

function stored(payerRefs: readonly LotPayerRef[]): StoredBatchView {
  return {
    id: "b1",
    scheme: "B2B",
    cycleStartsAt: paris("2026-10-01").toISOString(),
    cycleClosesAt: MONDAY.toISOString(),
    periodLabel: "du 1er au 4 octobre 2026",
    status: "constituted",
    constitutedAt: MONDAY.toISOString(),
    constitutedBy: "staff",
    depositedAt: null,
    cancelledAt: null,
    lastDownloadedAt: null,
    lineCount: 2,
    orderCount: 2,
    totalCents: 21_100,
    unmandatedCompanies: [],
    depositable: true,
    requestedCollectionDay: null,
    postponedFromDay: null,
    depositDeadline: null,
    lines: [],
    payerRefs,
  };
}

class FixedBatches extends CollectionBatchReader {
  constructor(private readonly batches: readonly StoredBatchView[]) {
    super();
  }
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

const WEEKLY: PayerModeSegments = {
  payerCompanyId: "c_week",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" }],
};

/** La facture mensuelle de septembre, rattrapée ; la semaine de l'hebdomadaire. */
const PERIODS = new Map([
  ["inv_month", { startsAt: paris("2026-09-01"), closesAt: paris("2026-10-01") }],
  ["inv_week", { startsAt: paris("2026-09-28"), closesAt: MONDAY }],
]);

async function payerModesOf(refs: readonly LotPayerRef[]) {
  const handler = new GetCollectionCycleHandler(
    new FixedBatches([stored(refs)]),
    new FixedModeDates(),
    new FixedPayerModes([WEEKLY]),
    new FixedInvoicePeriods(PERIODS),
  );
  const view = await handler.execute(new GetCollectionCycleQuery("le_1"));
  return view.batches.map((batch) => batch.payerModes);
}

describe("GetCollectionCycle — les modes des clients prélevés par chaque lot", () => {
  it("le lot du lundi 5 octobre 2026 qui rattrape une facture mensuelle : les deux modes", async () => {
    expect(
      await payerModesOf([
        { payerCompanyId: "c_month", invoiceId: "inv_month" },
        { payerCompanyId: "c_week", invoiceId: "inv_week" },
      ]),
    ).toEqual([["monthly", "weekly"]]);
  });

  it("le même lot sans rattrapage : l'hebdomadaire seul, quoi que le mensuel close", async () => {
    expect(await payerModesOf([{ payerCompanyId: "c_week", invoiceId: "inv_week" }])).toEqual([
      ["weekly"],
    ]);
  });

  it("une ligne d'arrêté compte au mode du payeur à la clôture du lot", async () => {
    expect(await payerModesOf([{ payerCompanyId: "c_month", invoiceId: null }])).toEqual([
      ["monthly"],
    ]);
  });
});
