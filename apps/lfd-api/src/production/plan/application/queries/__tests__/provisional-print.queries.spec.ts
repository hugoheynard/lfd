import { Buffer } from "node:buffer";

import { instantToLocal } from "@lfd/contracts";

import { type ProductionDay, ProductionDayRepository } from "../../../../day/index.js";
import { FixedDayOrders } from "../../../../channels/commerce/__tests__/day-orders-doubles.js";
import { DayResupplies } from "../../../../channels/commerce/__tests__/day-resupplies-doubles.js";
import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { ProvisionalPrint } from "../../../domain/entities/provisional-print.js";
import {
  ProvisionalPrintFileMissingError,
  ProvisionalPrintNotFoundError,
} from "../../../domain/errors/provisional-print-errors.js";
import { DOSSIER_PARTS } from "../../../domain/services/day-dossier-selection.js";
import { DOSSIER_ARTICLES } from "../../__tests__/dossier-dispatch-doubles.js";
import {
  ArrestedOrNot,
  FixedWithdrawals,
  FixedCommerceVersion,
  InMemoryProvisionalReader,
  NoAuthors,
  ProvisionalPrintTable,
} from "../../__tests__/provisional-print-doubles.js";
import { DossierGroupLabelsReading } from "../../services/dossier-group-labels.js";
import { LiveDossierContent } from "../../services/live-dossier-content.js";
import { GetPrintOptionsHandler } from "../get-print-options.handler.js";
import { GetPrintOptionsQuery } from "../get-print-options.query.js";
import { GetProvisionalPrintPdfHandler } from "../get-provisional-print-pdf.handler.js";
import { GetProvisionalPrintPdfQuery } from "../get-provisional-print-pdf.query.js";

/**
 * **La fenêtre d'impression et le PDF d'une impression** : l'état servi
 * avant et après l'arrêt, « la journée a changé », et le fichier rangé. Le
 * jour est dérivé de maintenant.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const ORDERS = [
  producibleOrder("ord_1", { lines: [orderLine("VIE-001", 12, "Croissant")] }),
  producibleOrder("ord_2", { reference: "ORD-0002", customerLabel: "Hôtel du Pont" }),
];

/**
 * Avant l'arrêt, la fenêtre ne charge pas la journée : elle lit le commerce.
 * Le cas arrêté se joue dans l'e2e, sur une journée réellement close.
 */
class OpenDays extends ProductionDayRepository {
  load(): Promise<ProductionDay> {
    return Promise.reject(new TypeError("une journée ouverte se lit au commerce"));
  }

  save(): Promise<void> {
    return Promise.reject(new TypeError("une lecture n'écrit rien"));
  }
}

function printed(run: number, commerceVersion: number): ProvisionalPrint {
  return ProvisionalPrint.drawn({
    id: `print_${String(run)}`,
    serviceDay: DAY,
    run,
    commerceVersion,
    printedAt: NOW,
    printedBy: "staff_1",
    orderFingerprints: new Map(),
    choice: { parts: new Set(DOSSIER_PARTS), groups: "all", orders: { kind: "all" } },
  });
}

function options(closed: boolean, version: number) {
  const table = new ProvisionalPrintTable();
  const handler = new GetPrintOptionsHandler(
    new ArrestedOrNot(closed),
    new OpenDays(),
    new LiveDossierContent(new FixedDayOrders(ORDERS), new FixedWithdrawals(), new DayResupplies()),
    new DossierGroupLabelsReading(
      new GroupingSourceReading(...placementPorts(DOSSIER_ARTICLES)),
      new InMemoryDisplaySettings().reader(),
    ),
    new InMemoryProvisionalReader(table),
    new FixedCommerceVersion(version),
    new NoAuthors(),
  );
  return { table, read: () => handler.execute(new GetPrintOptionsQuery(DAY)) };
}

describe("GetPrintOptionsHandler", () => {
  it("avant l'arrêt : commandes en direct, rayons du jour, aucune impression, rien de changé", async () => {
    const view = await options(false, 7).read();
    expect(view).toMatchObject({
      arrested: false,
      grouping: "shelf",
      prints: [],
      changedSinceLast: false,
    });
    expect(view.groups).toContain("Viennoiseries");
    expect(view.orders).toEqual([
      { orderId: "ord_1", reference: "ORD-ord_1", customerLabel: "Trois Ponts" },
      { orderId: "ord_2", reference: "ORD-0002", customerLabel: "Hôtel du Pont" },
    ]);
  });

  it("dit que la journée a changé quand la version du commerce a bougé depuis la dernière", async () => {
    const same = options(false, 7);
    same.table.rows.push(printed(1, 3), printed(2, 7));
    const moved = options(false, 9);
    moved.table.rows.push(printed(1, 7));

    const unchanged = await same.read();
    expect(unchanged.changedSinceLast).toBe(false);
    expect(unchanged.prints).toEqual([
      { id: "print_1", run: 1, printedAt: NOW.toISOString(), printedByName: null },
      { id: "print_2", run: 2, printedAt: NOW.toISOString(), printedByName: null },
    ]);
    expect((await moved.read()).changedSinceLast).toBe(true);
  });
});

describe("GetProvisionalPrintPdfHandler", () => {
  function pdf() {
    const table = new ProvisionalPrintTable();
    const store = new InMemoryProductionStore();
    const handler = new GetProvisionalPrintPdfHandler(new InMemoryProvisionalReader(table), store);
    return {
      table,
      store,
      read: (id: string) => handler.execute(new GetProvisionalPrintPdfQuery(DAY, id)),
    };
  }

  it("sert le fichier rangé sous le numéro de l'impression", async () => {
    const { table, store, read } = pdf();
    table.rows.push(printed(3, 7));
    const bytes = Buffer.from("%PDF-1.7 provisoire");
    await store.save(`${DAY}/provisoire-3.pdf`, { bytes, contentType: "application/pdf" });

    await expect(read("print_3")).resolves.toEqual({
      bytes,
      fileName: `dossier-provisoire-${DAY}-3.pdf`,
    });
  });

  it("refuse une impression inconnue, et dit quand le fichier n'a pas été rangé", async () => {
    const { table, read } = pdf();
    await expect(read("print_9")).rejects.toBeInstanceOf(ProvisionalPrintNotFoundError);
    table.rows.push(printed(1, 7));
    await expect(read("print_1")).rejects.toBeInstanceOf(ProvisionalPrintFileMissingError);
  });
});
