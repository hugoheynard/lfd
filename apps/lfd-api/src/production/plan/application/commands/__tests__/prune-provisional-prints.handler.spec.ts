import { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import { ProvisionalPrint } from "../../../domain/entities/provisional-print.js";
import { DOSSIER_PARTS } from "../../../domain/services/day-dossier-selection.js";
import {
  InMemoryProvisionalPruner,
  ProvisionalPrintTable,
} from "../../__tests__/provisional-print-doubles.js";
import { PruneProvisionalPrintsHandler } from "../prune-provisional-prints.handler.js";

/** Le balayage nocturne : les journées passées perdent leurs impressions et leurs PDF. */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const YESTERDAY = instantToLocal(new Date(NOW.getTime() - 24 * 60 * 60 * 1000)).day;

function printed(day: string, run: number): ProvisionalPrint {
  return ProvisionalPrint.drawn({
    id: `${day}-${String(run)}`,
    serviceDay: day,
    run,
    commerceVersion: 0,
    printedAt: NOW,
    printedBy: "staff_1",
    orderFingerprints: new Map(),
    functionSheetIds: [],
    choice: { parts: new Set(DOSSIER_PARTS), groups: "all", orders: { kind: "all" } },
  });
}

async function scene() {
  const table = new ProvisionalPrintTable();
  const store = new InMemoryProductionStore();
  for (const print of [printed(YESTERDAY, 1), printed(TODAY, 1)]) {
    table.rows.push(print);
    await store.save(`${print.state.serviceDay}/provisoire-1.pdf`, {
      bytes: Buffer.from("%PDF"),
      contentType: "application/pdf",
    });
  }
  const handler = new PruneProvisionalPrintsHandler(
    new InMemoryProvisionalPruner(table),
    store,
    new FixedClock(NOW),
  );
  return { table, store, handler };
}

describe("PruneProvisionalPrintsHandler", () => {
  it("retire les impressions des journées passées et leurs PDF, jamais celles du jour", async () => {
    const { table, store, handler } = await scene();
    await expect(handler.execute()).resolves.toBe(1);
    expect(table.rows.map((print) => print.state.serviceDay)).toEqual([TODAY]);
    expect([...store.objects.keys()]).toEqual([`${TODAY}/provisoire-1.pdf`]);
    await expect(handler.execute()).resolves.toBe(0);
  });

  it("garde les lignes quand le stockage est en panne : la nuit suivante retrouve tout", async () => {
    const { table, store, handler } = await scene();
    store.failOn = "delete";
    await expect(handler.execute()).rejects.toThrow("stockage en panne");
    expect(table.rows).toHaveLength(2);
  });
});
