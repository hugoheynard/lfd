import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { CatalogFamilyView } from "@lfd/contracts";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { instantToLocal } from "@lfd/contracts";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import {
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../../channels/commerce/index.js";
import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../../day/index.js";
import { ProductionDayRepository } from "../../../../day/index.js";
import { dayDossierPdfKey } from "../../../domain/services/day-dossier-pdf.js";
import { ServiceDay } from "../../../../day/index.js";
import {
  FixedOrderPrintColors,
  FixedResupplyPrintColors,
} from "../../../../channels/commerce/__tests__/order-print-colors-doubles.js";
import { FixedTrancheReading } from "../../__tests__/tranche-reading-doubles.js";
import { FixedPaperLogo } from "../../../../shared/print/application/__tests__/paper-logo-doubles.js";
import { FixedPlannedDeliveryNotes } from "../../../../channels/commerce/__tests__/planned-delivery-notes-doubles.js";
import { InMemoryProductionStore } from "../../../../shared/print/application/__tests__/production-store-doubles.js";
import { OrderSheetPaper, ProductionPaperArchive } from "../../../../shared/print/index.js";
import { ProductionPaperRenderer } from "../../services/production-paper.service.js";
import { GetDayDossierPdfHandler } from "../get-day-dossier-pdf.handler.js";
import { GetDayDossierPdfQuery } from "../get-day-dossier-pdf.query.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import {
  article,
  UnreadWorkstationOfProducts,
} from "../../../../workstations/application/__tests__/placement-doubles.js";

/**
 * **Le dossier du jour, servi** : refusé avant l'arrêt, archivé au premier
 * tirage, relu ensuite, et refait — sous une autre clé — après un retirage.
 *
 * Le jour est dérivé de maintenant ; les instants de clôture ne sont que
 * recopiés dans le papier, jamais comparés à l'horloge.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;
const CLOSED = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const RETAKEN = new Date(NOW.getTime() - 60 * 60 * 1000);
const VIENNOISERIES: CatalogFamilyView = { id: "fam-vien", name: "Viennoiseries", position: 0 };

function order(orderId: string): ProducibleOrder {
  return producibleOrder(orderId, { lines: [orderLine("VIE-001", 12, "Croissant")] });
}

class Days extends ProductionDayRepository {
  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new TypeError("une lecture n'écrit rien"));
  }
}

/** Le commerce : le croissant et son rayon, ou une panne ; compte ses lectures. */
class Shelves extends ProductionArticlesReader {
  broken = false;
  asked = 0;

  articlesOf(): Promise<ReadonlyMap<string, ProductionArticle>> {
    this.asked += 1;
    if (this.broken) {
      return Promise.reject(new TypeError("commerce injoignable"));
    }
    return Promise.resolve(new Map([["VIE-001", article("VIE-001", "VIE", VIENNOISERIES)]]));
  }

  allArticles(): Promise<readonly ProductionArticle[]> {
    return Promise.reject(new TypeError("le dossier ne liste pas le catalogue"));
  }
}

/** Sans origine du back-office : aucun QR, le papier reste juste. */
class NoAdminOrigin extends AppConfig {
  override adminBaseUrl(): string | null {
    return null;
  }
}

function setup(
  day: ProductionDay,
  colors = new FixedOrderPrintColors(),
  deliveryNotes = new FixedPlannedDeliveryNotes(),
  tranches = new FixedTrancheReading(),
): {
  handler: GetDayDossierPdfHandler;
  store: InMemoryProductionStore;
  shelves: Shelves;
} {
  const store = new InMemoryProductionStore();
  const shelves = new Shelves();
  const renderer = new ProductionPaperRenderer(
    new GroupingSourceReading(shelves, new UnreadWorkstationOfProducts()),
    new OrderSheetPaper(new NoAdminOrigin(), colors, new FixedPaperLogo()),
    new FixedResupplyPrintColors(),
    new FixedPaperLogo(),
    deliveryNotes,
    new InMemoryDisplaySettings().reader(),
    tranches,
  );
  return {
    handler: new GetDayDossierPdfHandler(
      new Days(day),
      renderer,
      new ProductionPaperArchive(store),
    ),
    store,
    shelves,
  };
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1")], new Set<string>(), CLOSED, null);
  return day;
}

describe("GetDayDossierPdfHandler", () => {
  it("refuse une journée qui n'est pas arrêtée", async () => {
    const { handler, store } = setup(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(handler.execute(new GetDayDossierPdfQuery(DAY))).rejects.toBeInstanceOf(
      ProductionDayNotClosedError,
    );
    expect(store.objects.size).toBe(0);
  });

  it("fabrique le PDF au premier tirage, l'archive, puis le relit sans refaire", async () => {
    const { handler, store, shelves } = setup(closedDay());
    const first = await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(first.fileName).toBe(`dossier-du-jour-${DAY}.pdf`);
    expect(first.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(store.objects.get(dayDossierPdfKey(DAY, null))?.bytes.equals(first.bytes)).toBe(true);

    const second = await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(second.bytes.equals(first.bytes)).toBe(true);
    expect(shelves.asked).toBe(1);
  });

  it("après un retirage, range le dossier complété sous une autre clé, sans toucher l'original", async () => {
    const day = closedDay();
    const { handler, store } = setup(day);
    await handler.execute(new GetDayDossierPdfQuery(DAY));
    day.retake([order("ord_1"), order("ord_2")], new Set<string>(), RETAKEN, "staff-1", null);

    await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect([...store.objects.keys()].sort()).toEqual(
      [dayDossierPdfKey(DAY, null), dayDossierPdfKey(DAY, RETAKEN)].sort(),
    );
  });

  it("sert le dossier sans rayons quand le commerce est muet, mais ne l'archive pas", async () => {
    const { handler, store, shelves } = setup(closedDay());
    shelves.broken = true;
    const paper = await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(paper.bytes.length).toBeGreaterThan(0);
    expect(store.objects.size).toBe(0);
  });

  it("sert le dossier sans calendrier quand les tranches sont illisibles, mais ne l'archive pas", async () => {
    const { handler, store } = setup(
      closedDay(),
      new FixedOrderPrintColors(),
      new FixedPlannedDeliveryNotes(),
      new FixedTrancheReading(null),
    );
    const paper = await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(paper.bytes.length).toBeGreaterThan(0);
    expect(store.objects.size).toBe(0);
  });

  it("lit la couleur de chaque commande au tirage, et ne la relit pas sur un dossier archivé", async () => {
    const colors = new FixedOrderPrintColors(new Map([["ord_1", "#2e86ab"]]));
    const { handler } = setup(closedDay(), colors);
    const colored = await handler.execute(new GetDayDossierPdfQuery(DAY));
    await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(colors.asked).toEqual([["ord_1"]]);

    const plain = await setup(closedDay()).handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(colored.bytes.equals(plain.bytes)).toBe(false);
  });

  it("imprime le BL de transport de chaque commande derrière son bon (Hugo, 2026-10-25)", async () => {
    const notes = new FixedPlannedDeliveryNotes(new Map([["ord_1", "BL-0001-1"]]));
    const { handler } = setup(closedDay(), new FixedOrderPrintColors(), notes);
    const paper = await handler.execute(new GetDayDossierPdfQuery(DAY));
    const pages = pdfPages(paper.bytes);
    expect(notes.asked).toEqual([["ord_1"]]);
    expect(pages[pages.length - 1]).toContain("BON DE LIVRAISON BL-0001-1");
  });

  it("sert le dossier sans BL quand le commerce ne les rend pas, mais ne l'archive pas", async () => {
    const notes = new FixedPlannedDeliveryNotes(new Map(), true);
    const { handler, store } = setup(closedDay(), new FixedOrderPrintColors(), notes);
    const paper = await handler.execute(new GetDayDossierPdfQuery(DAY));
    expect(pdfPages(paper.bytes).join("")).not.toContain("BON DE LIVRAISON");
    expect(store.objects.size).toBe(0);
  });
});
