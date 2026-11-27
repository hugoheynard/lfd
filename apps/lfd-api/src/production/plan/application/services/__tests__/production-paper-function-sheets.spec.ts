import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import {
  BrokenEventFunctionSheets,
  FixedEventFunctionSheets,
} from "../../../../channels/events/__tests__/event-function-sheets-doubles.js";
import type { EventFunctionSheetsReader } from "../../../../channels/events/index.js";
import {
  type ProductionDay,
  type ProductionOrderSnapshot,
  ServiceDay,
} from "../../../../day/index.js";
import { closedDay as frozenDay } from "../../../../day/application/__tests__/closed-day-doubles.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { NoAdminOrigin } from "../../__tests__/dossier-dispatch-doubles.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { OrderSheetPaper } from "../../../../shared/print/index.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import {
  depositedPdf,
  pageCountOf,
} from "../../../../../platform/pdf/__tests__/function-sheet-pdf.fixture.js";
import { DossierFunctionSheetsReading } from "../dossier-function-sheets-reading.service.js";
import { ProductionPaperRenderer } from "../production-paper.service.js";
import { DOSSIER_PARTS, WHOLE_DOSSIER } from "../../../domain/services/day-dossier-selection.js";

/**
 * **Les fiches de fonction au tirage du dossier** : lues à chaque tirage, et
 * un dossier tiré sans elles (panne) n'est pas archivé. Le jour et l'instant
 * ne sont que recopiés, jamais comparés à l'horloge.
 */
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");

const ORDER: ProductionOrderSnapshot & ProducibleOrder = {
  packed: null,
  orderId: "ord-1",
  rank: 1,
  reference: "ORD-0001",
  customerLabel: "Hôtel des Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Village",
  dueAt: "07:30",
  clientele: "pro",
  siteId: null,
  offPlan: false,
  sheetDetails: null,
  lines: [
    { sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece", madeToOrder: null },
  ],
};

function papersWith(sheets: EventFunctionSheetsReader): ProductionPaperRenderer {
  return new ProductionPaperRenderer(
    new GroupingSourceReading(...placementPorts()),
    new OrderSheetPaper(new NoAdminOrigin(), new FixedOrderPrintColors(), new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    FixedPlannedDeliveryNotes.forEveryOrder(),
    new InMemoryDisplaySettings().reader(),
    new FixedTrancheReading(),
    new DossierFunctionSheetsReading(sheets),
  );
}

function closedDay(): ProductionDay {
  return frozenDay(ServiceDay.of(DAY), CLOSED, []);
}

async function wedding(): Promise<FixedEventFunctionSheets> {
  return new FixedEventFunctionSheets([
    {
      eventId: "evt-1",
      eventName: "Mariage Dupont",
      sheets: [{ sheetId: "s1", fileName: "deroule.pdf", bytes: await depositedPdf("Déroulé", 2) }],
    },
  ]);
}

describe("ProductionPaperRenderer — les fiches de fonction", () => {
  it("le dossier entier joint les fiches du jour et reste archivable", async () => {
    const sheets = await wedding();
    const without = await papersWith(new FixedEventFunctionSheets()).dossierOf(closedDay());

    const drawn = await papersWith(sheets).dossierOf(closedDay());

    expect(sheets.asked).toEqual([DAY]);
    expect(drawn.archivable).toBe(true);
    expect(await pageCountOf(drawn.bytes)).toBe((await pageCountOf(without.bytes)) + 1 + 2);
  });

  it("des événements en panne : le dossier part sans les fiches et n'est pas archivé", async () => {
    const drawn = await papersWith(new BrokenEventFunctionSheets()).dossierOf(closedDay());
    expect(drawn.archivable).toBe(false);
  });

  it("un extrait sans la partie ne lit pas les fiches", async () => {
    const sheets = await wedding();
    const parts = new Set(DOSSIER_PARTS.filter((part) => part !== "functionSheets"));

    await papersWith(sheets).dossierOf(closedDay(), { ...WHOLE_DOSSIER, parts });

    expect(sheets.asked).toEqual([]);
  });

  it("une impression provisoire rend les fiches qu'elle porte", async () => {
    const paper = await papersWith(await wedding()).provisionalOf(
      { serviceDay: DAY, orders: [ORDER], resupplies: [] },
      { run: 2, printedAt: CLOSED },
      WHOLE_DOSSIER,
    );
    expect(paper.functionSheetIds).toEqual(["s1"]);
  });
});
