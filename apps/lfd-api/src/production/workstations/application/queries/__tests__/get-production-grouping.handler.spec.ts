import type { CatalogFamilyView } from "@lfd/contracts";

import { WorkshopShelvesReader } from "../../../../channels/commerce/index.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import {
  article,
  FailingWorkstationOfProducts,
  FixedProductionArticles,
  FixedWorkstationOfProducts,
  UnreadWorkstationOfProducts,
} from "../../__tests__/placement-doubles.js";
import { GroupingSourceReading } from "../../services/grouping-source-reading.service.js";
import type { WorkstationOfProducts } from "../../../domain/ports/workstation-of-products.js";
import { GetProductionGroupingHandler } from "../get-production-grouping.handler.js";
import { GetProductionGroupingQuery } from "../get-production-grouping.query.js";

const SAVORY: CatalogFamilyView = { id: "fam-savory", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };

/** Les rayons du commerce, ou une panne. */
class Shelves extends WorkshopShelvesReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly down = false) {
    super();
  }

  shelvesOf(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    this.asked.push(skus);
    if (this.down) {
      return Promise.reject(new Error("commerce injoignable"));
    }
    const known = new Map([
      ["QUI-8", SAVORY],
      ["BAG-1", BREADS],
    ]);
    return Promise.resolve(
      new Map(
        skus.flatMap((sku) => {
          const family = known.get(sku);
          return family === undefined ? [] : [[sku, family] as const];
        }),
      ),
    );
  }
}

function handlerFor(
  mode: "shelf" | "workstation",
  workstations: WorkstationOfProducts,
  shelves = new Shelves(),
) {
  const settings = new InMemoryDisplaySettings(
    mode === "shelf"
      ? null
      : ProductionDisplaySettings.of({ showSubcategories: false, grouping: mode }),
  );
  const articles = new FixedProductionArticles([
    article("QUI-8", "QUI", SAVORY),
    article("BAG-1", "BAG", BREADS),
  ]);
  const reading = new GroupingSourceReading(shelves, articles, workstations);
  return {
    handler: new GetProductionGroupingHandler(settings.reader(), reading),
    shelves,
    articles,
  };
}

describe("GetProductionGroupingHandler — le rangement servi au front", () => {
  it("range par rayon sans réglage posé, sans lire les postes, et sans doublon", async () => {
    const workstations = new UnreadWorkstationOfProducts();
    const { handler, articles } = handlerFor("shelf", workstations);

    const view = await handler.execute(
      new GetProductionGroupingQuery(["QUI-8", "BAG-1", "QUI-8", "X"]),
    );

    expect(view).toMatchObject({ mode: "shelf", shelvesKnown: true, workstationsKnown: true });
    expect(view.entries.map((entry) => [entry.sku, entry.title])).toEqual([
      ["BAG-1", "Pains"],
      ["QUI-8", "Traiteur salé"],
      ["X", "Hors catalogue"],
    ]);
    expect(workstations.calls).toBe(0);
    expect(articles.asked).toEqual([]);
  });

  it("range par poste en mode prod, un SKU inconnu en « Hors catalogue — à ranger »", async () => {
    const { handler, shelves } = handlerFor(
      "workstation",
      new FixedWorkstationOfProducts(
        [{ id: "ws-pat", name: "Pâtisserie", position: 0 }],
        new Map([["QUI", "ws-pat"]]),
      ),
    );

    const view = await handler.execute(new GetProductionGroupingQuery(["BAG-1", "QUI-8", "X"]));

    expect(view.mode).toBe("workstation");
    expect(view.entries.map((entry) => [entry.sku, entry.key, entry.title, entry.kind])).toEqual([
      ["QUI-8", "ws:ws-pat", "Pâtisserie", "workstation"],
      ["BAG-1", "fam-bread", "Pains — à ranger", "unplaced"],
      ["X", "?", "Hors catalogue — à ranger", "off_catalog"],
    ]);
    expect(shelves.asked).toEqual([]);
  });

  it("range par rayon et le dit quand les postes sont illisibles en mode prod", async () => {
    const { handler } = handlerFor("workstation", new FailingWorkstationOfProducts());

    const view = await handler.execute(new GetProductionGroupingQuery(["QUI-8"]));

    expect(view).toMatchObject({
      mode: "workstation",
      workstationsKnown: false,
      shelvesKnown: true,
    });
    expect(view.entries[0]).toMatchObject({ kind: "shelf", title: "Traiteur salé" });
  });

  it("met tout en « Rayon inconnu » et le dit quand les rayons sont illisibles", async () => {
    const { handler } = handlerFor("shelf", new UnreadWorkstationOfProducts(), new Shelves(true));

    const view = await handler.execute(new GetProductionGroupingQuery(["QUI-8"]));

    expect(view.shelvesKnown).toBe(false);
    expect(view.entries[0]).toMatchObject({ title: "Rayon inconnu", kind: "off_catalog" });
  });
});
