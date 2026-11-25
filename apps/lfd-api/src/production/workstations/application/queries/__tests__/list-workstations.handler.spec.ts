import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  type ExpectedDayProduction,
  type ExpectedDayResupplies,
  ExpectedProductionReader,
  ExpectedResuppliesReader,
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../../channels/commerce/index.js";
import { KnownArticles, type ServiceRange } from "../../../../day/index.js";
import {
  type WorkstationListing,
  WorkstationMapReader,
} from "../../../domain/ports/workstation-map.reader.js";
import { ListWorkstationsHandler } from "../list-workstations.handler.js";

/** Midi à Paris : le jour de Paris est celui de l'instant. */
const NOW = new Date("2026-11-16T11:00:00.000Z");

class FixedListing extends WorkstationMapReader {
  listing(): Promise<WorkstationListing> {
    return Promise.resolve({
      workstations: [
        { id: "ws_pastry", name: "Pâtisserie", position: 0, trackingLevel: "detailed" },
      ],
      placements: new Map([
        ["QUI-001", [{ workstationId: "ws_pastry", finishes: true, position: null }]],
      ]),
    });
  }
}

class FixedArticles extends ProductionArticlesReader {
  constructor(private readonly articles: readonly ProductionArticle[]) {
    super();
  }

  articlesOf(): Promise<ReadonlyMap<string, ProductionArticle>> {
    return Promise.resolve(new Map(this.articles.map((article) => [article.sku, article])));
  }

  allArticles(): Promise<readonly ProductionArticle[]> {
    return Promise.resolve(this.articles);
  }
}

/** Retient la plage demandée et rend ses articles. */
class RecordingKnown extends KnownArticles {
  readonly asked: ServiceRange[] = [];

  between(range: ServiceRange): Promise<readonly { sku: string; productName: string }[]> {
    this.asked.push(range);
    return Promise.resolve([{ sku: "PAST-1", productName: "Pain d'hier" }]);
  }
}

class RecordingOrders extends ExpectedProductionReader {
  readonly asked: ServiceRange[] = [];

  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]> {
    this.asked.push(range);
    return Promise.resolve([
      {
        day: range.from.value,
        orderCount: 1,
        items: [{ sku: "QUI-001-6", productName: "Quiche 6", quantity: 2, saleUnit: "piece" }],
      },
    ]);
  }
}

class RecordingResupplies extends ExpectedResuppliesReader {
  readonly asked: ServiceRange[] = [];

  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayResupplies[]> {
    this.asked.push(range);
    return Promise.resolve([
      {
        day: range.to.value,
        items: [{ sku: "GONE-1", productName: "Brioche retirée", quantity: 1, saleUnit: "piece" }],
      },
    ]);
  }
}

const QUICHE: ProductionArticle = {
  sku: "QUI-001-6",
  productSku: "QUI-001",
  productName: "Quiche",
  variantName: "Quiche 6",
  family: { id: "fam_savory", name: "Traiteur salé", position: 3 },
  sellable: false,
};

describe("ListWorkstationsHandler — la page Postes", () => {
  it("lit les journées arrêtées de J−30 à aujourd'hui et la demande des 14 prochains jours", async () => {
    const known = new RecordingKnown();
    const orders = new RecordingOrders();
    const resupplies = new RecordingResupplies();
    const handler = new ListWorkstationsHandler(
      new FixedListing(),
      new FixedArticles([QUICHE]),
      known,
      orders,
      resupplies,
      new FixedClock(NOW),
    );

    const page = await handler.execute();

    expect(known.asked[0]?.length).toBe(31);
    expect(known.asked[0]?.to.value).toBe("2026-11-16");
    expect(orders.asked[0]?.from.value).toBe("2026-11-16");
    expect(orders.asked[0]?.length).toBe(14);
    expect(resupplies.asked[0]?.length).toBe(14);
    expect(page.products).toEqual([
      expect.objectContaining({ productSku: "QUI-001", workstationId: "ws_pastry", ordered: true }),
    ]);
    expect(page.offCatalog).toEqual([
      { sku: "PAST-1", productName: "Pain d'hier" },
      { sku: "GONE-1", productName: "Brioche retirée" },
    ]);
    expect(page.unplacedCount).toBe(0);
  });
});
