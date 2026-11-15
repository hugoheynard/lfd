import type { CatalogFamilyView } from "@lfd/contracts";

import { InMemoryDisplaySettings } from "../../../../application/__tests__/production-display-settings-doubles.js";
import { AppConfig } from "../../../../../platform/config/app-config.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import { WorkshopShelvesReader } from "../../../../channels/commerce/workshop-shelves.reader.js";
import {
  ProductionDay,
  type ProductionOrderSnapshot,
} from "../../../../day/domain/entities/production-day.js";
import { atelierSheetPdfKey } from "../../../../shared/print/index.js";
import { ServiceDay } from "../../../../day/index.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../application/__tests__/order-print-colors-doubles.js";
import {
  FixedTrancheReading,
  FixedPaperLogo,
  FixedPlannedDeliveryNotes,
} from "../../../../application/__tests__/paper-doubles.js";
import { InMemoryProductionStore } from "../../../../application/__tests__/quality-doubles.js";
import { ProductionPaperArchive } from "../../../../shared/print/index.js";
import { ProductionPaperRenderer, atelierSheetSlotOf } from "../production-paper.service.js";

/**
 * **La pastille de la fiche d'atelier** (plan de la planche des documents v2,
 * §0 bis, Hugo 2026-10-22) : la couleur se lit au premier tirage, par le port
 * du commerce. Le jour et l'instant ne sont que recopiés, jamais comparés à
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

class NoShelves extends WorkshopShelvesReader {
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    return Promise.resolve(new Map());
  }
}

function papersWith(
  colors: FixedOrderPrintColors,
  resupplyColors = new FixedResupplyPrintColors(),
  deliveryNotes = new FixedPlannedDeliveryNotes(),
): {
  papers: ProductionPaperRenderer;
  archive: ProductionPaperArchive;
  store: InMemoryProductionStore;
} {
  const store = new InMemoryProductionStore();
  return {
    papers: new ProductionPaperRenderer(
      new NoAdminOrigin(),
      new NoShelves(),
      colors,
      resupplyColors,
      new FixedPaperLogo(),
      deliveryNotes,
      new InMemoryDisplaySettings().reader(),
      new FixedTrancheReading(),
    ),
    archive: new ProductionPaperArchive(store),
    store,
  };
}

/** Une journée arrêtée : une commande, et deux réassorts vers le même site. */
function dayWithResupplies(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  const resupply = (resupplyId: string) => ({
    resupplyId,
    siteId: "site-v",
    siteLabel: "Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4, saleUnit: "piece" as const }],
  });
  day.close([ORDER], new Set<string>(), CLOSED, null, [resupply("r-1"), resupply("r-2")]);
  return day;
}

describe("ProductionPaperRenderer.sheetOf — la pastille de la commande", () => {
  it("demande la couleur de SA commande, et la pose : le papier diffère d'une fiche sans couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const colored = await papersWith(colors).papers.sheetOf(ORDER, DAY, CLOSED);
    const plain = await papersWith(new FixedOrderPrintColors()).papers.sheetOf(ORDER, DAY, CLOSED);

    expect(colors.asked).toEqual([["ord-1"]]);
    expect(colored.bytes.equals(plain.bytes)).toBe(false);
  });

  it("une fiche déjà archivée est resservie sans relire la couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const { papers, archive, store } = papersWith(colors);
    const sheet = () =>
      archive.storedOr(atelierSheetSlotOf(ORDER), () => papers.sheetOf(ORDER, DAY, CLOSED));
    const first = await sheet();
    const second = await sheet();

    expect(colors.asked).toHaveLength(1);
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(store.objects.has(atelierSheetPdfKey("ord-1"))).toBe(true);
  });
});

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
