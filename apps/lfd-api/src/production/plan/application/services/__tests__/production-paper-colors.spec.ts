import { DossierFunctionSheetsReading } from "../dossier-function-sheets-reading.service.js";
import { FixedEventFunctionSheets } from "../../../../channels/events/__tests__/event-function-sheets-doubles.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import {
  ProductionDay,
  type ProductionOrderSnapshot,
} from "../../../../day/domain/entities/production-day.js";
import { ServiceDay } from "../../../../day/index.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { OrderSheetPaper } from "../../../../shared/print/index.js";
import { ProductionPaperRenderer } from "../production-paper.service.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";

/**
 * **La teinte du réassort** sur le compte et le dossier (Hugo, 2026-10-22) :
 * elle se lit au tirage, par le port du commerce. La pastille de la fiche de
 * commande est éprouvée avec l'imprimerie (`order-sheet-paper.spec.ts`). Le jour et l'instant ne sont que recopiés, jamais comparés à
 * l'horloge.
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

class NoAdminOrigin extends AppConfig {
  override adminBaseUrl(): string | null {
    return null;
  }
}

function papersWith(
  colors: FixedOrderPrintColors,
  resupplyColors = new FixedResupplyPrintColors(),
  deliveryNotes = FixedPlannedDeliveryNotes.forEveryOrder(),
): { papers: ProductionPaperRenderer } {
  return {
    papers: new ProductionPaperRenderer(
      new GroupingSourceReading(...placementPorts()),
      new OrderSheetPaper(new NoAdminOrigin(), colors, new FixedPaperLogo()),
      resupplyColors,
      new FixedPaperLogo(),
      deliveryNotes,
      new InMemoryDisplaySettings().reader(),
      new FixedTrancheReading(),
      new DossierFunctionSheetsReading(new FixedEventFunctionSheets()),
    ),
  };
}

/** Une journée arrêtée : une commande, et deux réassorts vers le même site. */
function dayWithResupplies(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  const resupply = (resupplyId: string) => ({
    resupplyId,
    siteId: "site-v",
    offPlan: false,
    siteLabel: "Village",
    name: null,
    servedByTransfer: true,
    arrivalBy: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4, saleUnit: "piece" as const }],
  });
  day.close([ORDER], new Set<string>(), CLOSED, null, [resupply("r-1"), resupply("r-2")]);
  return day;
}

describe("ProductionPaperRenderer.countOf — la teinte du réassort (Hugo, 2026-10-22)", () => {
  it("demande la teinte du site destinataire, une fois, et la pose dans le camembert", async () => {
    const resupplyColors = new FixedResupplyPrintColors(new Map([["site-v", "#26a69a"]]));
    const tinted = await papersWith(new FixedOrderPrintColors(), resupplyColors).papers.countOf(
      dayWithResupplies(),
    );
    const grey = await papersWith(new FixedOrderPrintColors()).papers.countOf(dayWithResupplies());

    expect(resupplyColors.asked).toEqual([["site-v"]]);
    expect(tinted.bytes.equals(grey.bytes)).toBe(false);
  });
});

describe("ProductionPaperRenderer.dossierOf — la pastille du bon de réassort (Hugo, 2026-10-22)", () => {
  it("demande la teinte du site destinataire, une fois, et la pose sur le bon", async () => {
    const resupplyColors = new FixedResupplyPrintColors(new Map([["site-v", "#26a69a"]]));
    const tinted = await papersWith(new FixedOrderPrintColors(), resupplyColors).papers.dossierOf(
      dayWithResupplies(),
    );
    const grey = await papersWith(new FixedOrderPrintColors()).papers.dossierOf(
      dayWithResupplies(),
    );

    expect(resupplyColors.asked).toEqual([["site-v"]]);
    expect(tinted.bytes.equals(grey.bytes)).toBe(false);
  });
});
