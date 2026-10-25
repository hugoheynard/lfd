import type { CatalogFamilyView } from "@lfd/contracts";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import {
  ProductionDay,
  type ProductionOrderSnapshot,
} from "../../../domain/entities/production-day.js";
import { atelierSheetPdfKey } from "../../../domain/services/atelier-sheet-pdf.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../__tests__/order-print-colors-doubles.js";
import { InMemoryProductionStore } from "../../__tests__/quality-doubles.js";
import { ProductionPapers } from "../production-paper.service.js";

/**
 * **La pastille de la fiche d'atelier** (plan de la planche des documents v2,
 * §0 bis, Hugo 2026-10-22) : la couleur se lit au premier tirage, par le port
 * du commerce. Le jour et l'instant ne sont que recopiés, jamais comparés à
 * l'horloge.
 */
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");

const ORDER: ProductionOrderSnapshot = {
  packed: null,
  orderId: "ord-1",
  reference: "ORD-0001",
  customerLabel: "Hôtel des Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Village",
  dueAt: "07:30",
  clientele: "pro",
  siteId: null,
  sheetDetails: null,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6 }],
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
): {
  papers: ProductionPapers;
  store: InMemoryProductionStore;
} {
  const store = new InMemoryProductionStore();
  return {
    papers: new ProductionPapers(
      store,
      new NoAdminOrigin(),
      new NoShelves(),
      colors,
      resupplyColors,
    ),
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
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4 }],
  });
  day.close([ORDER], new Set<string>(), CLOSED, null, [resupply("r-1"), resupply("r-2")]);
  return day;
}

describe("ProductionPapers.sheetOf — la pastille de la commande", () => {
  it("demande la couleur de SA commande, et la pose : le papier diffère d'une fiche sans couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const colored = await papersWith(colors).papers.sheetOf(ORDER, DAY, CLOSED);
    const plain = await papersWith(new FixedOrderPrintColors()).papers.sheetOf(ORDER, DAY, CLOSED);

    expect(colors.asked).toEqual([["ord-1"]]);
    expect(colored.bytes.equals(plain.bytes)).toBe(false);
  });

  it("une fiche déjà archivée est resservie sans relire la couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const { papers, store } = papersWith(colors);
    const first = await papers.sheetOf(ORDER, DAY, CLOSED);
    const second = await papers.sheetOf(ORDER, DAY, CLOSED);

    expect(colors.asked).toHaveLength(1);
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(store.objects.has(atelierSheetPdfKey("ord-1"))).toBe(true);
  });
});

describe("ProductionPapers.countOf — la teinte du réassort (Hugo, 2026-10-22)", () => {
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

describe("ProductionPapers.dossierOf — la pastille du bon de réassort (Hugo, 2026-10-22)", () => {
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
