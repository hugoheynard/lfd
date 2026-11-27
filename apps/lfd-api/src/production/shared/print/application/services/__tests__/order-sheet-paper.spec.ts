import { AppConfig } from "../../../../../../platform/config/app-config.js";
import type { ProducibleOrder } from "../../../../../channels/commerce/day-orders.reader.js";
import type { ProductionOrderSnapshot } from "../../../../../day/index.js";
import { FixedOrderPrintColors } from "../../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedPaperLogo } from "../../__tests__/paper-logo-doubles.js";
import { InMemoryProductionStore } from "../../__tests__/production-store-doubles.js";
import { atelierSheetPdfKey } from "../../../domain/services/atelier-sheet-pdf.js";
import { OrderSheetPaper, atelierSheetSlotOf } from "../order-sheet-paper.service.js";
import { ProductionPaperArchive } from "../production-paper-archive.service.js";

/**
 * **La fiche de commande de l'imprimerie** : la pastille se lit au premier
 * tirage par le port du commerce (planche des documents v2, §0 bis, Hugo
 * 2026-10-22), et le QR suit l'origine du back-office. Le jour et l'instant ne
 * sont que recopiés, jamais comparés à l'horloge.
 */
const DAY = "2026-10-07";
const CLOSED = new Date("2026-10-06T16:00:00.000Z");

const ORDER: ProductionOrderSnapshot & ProducibleOrder = {
  packed: null,
  orderId: "ord-1",
  rank: 1,
  reference: "ORD 0001",
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

class AdminOrigin extends AppConfig {
  constructor(private readonly origin: string | null) {
    super();
  }

  override adminBaseUrl(): string | null {
    return this.origin;
  }
}

function sheetsWith(colors: FixedOrderPrintColors, origin: string | null = null): OrderSheetPaper {
  return new OrderSheetPaper(new AdminOrigin(origin), colors, new FixedPaperLogo());
}

describe("OrderSheetPaper.sheetOf — la pastille de la commande", () => {
  it("demande la couleur de SA commande, et la pose : le papier diffère d'une fiche sans couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const colored = await sheetsWith(colors).sheetOf(ORDER, DAY, CLOSED);
    const plain = await sheetsWith(new FixedOrderPrintColors()).sheetOf(ORDER, DAY, CLOSED);

    expect(colors.asked).toEqual([["ord-1"]]);
    expect(colored.archivable).toBe(true);
    expect(colored.bytes.equals(plain.bytes)).toBe(false);
  });

  it("une fiche déjà archivée est resservie sans relire la couleur", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const sheets = sheetsWith(colors);
    const store = new InMemoryProductionStore();
    const archive = new ProductionPaperArchive(store);
    const sheet = () =>
      archive.storedOr(atelierSheetSlotOf(ORDER), () => sheets.sheetOf(ORDER, DAY, CLOSED));
    const first = await sheet();
    const second = await sheet();

    expect(colors.asked).toHaveLength(1);
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(store.objects.has(atelierSheetPdfKey("ord-1"))).toBe(true);
  });
});

describe("OrderSheetPaper.marksOf — ce que le dossier pose sur chaque fiche", () => {
  it("lit les couleurs du lot en une fois", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord-1", "#2e86ab"]]));
    const marks = await sheetsWith(colors).marksOf(["ord-1", "ord-2"]);

    expect(colors.asked).toEqual([["ord-1", "ord-2"]]);
    expect(marks.colors.get("ord-1")).toBe("#2e86ab");
    expect(marks.colors.has("ord-2")).toBe(false);
  });

  it("sans origine du back-office, aucun QR : l'URL est vide", async () => {
    const marks = await sheetsWith(new FixedOrderPrintColors()).marksOf([]);

    expect(marks.colisageUrlOf("ORD 0001")).toBe("");
  });

  it("avec l'origine, l'URL du colisage porte la référence encodée", async () => {
    const marks = await sheetsWith(new FixedOrderPrintColors(), "https://admin.lfc.test").marksOf(
      [],
    );

    expect(marks.colisageUrlOf("ORD 0001")).toBe("https://admin.lfc.test/colisage/ORD%200001");
  });
});
