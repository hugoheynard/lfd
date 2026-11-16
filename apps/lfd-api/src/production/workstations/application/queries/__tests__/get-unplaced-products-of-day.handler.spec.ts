import type { CatalogFamilyView } from "@lfd/contracts";

import {
  type ExpectedDayProduction,
  type ExpectedDayResupplies,
  ExpectedProductionReader,
  ExpectedResuppliesReader,
} from "../../../../channels/commerce/index.js";
import { FixedStatus } from "../../../../day/application/__tests__/day-status-doubles.js";
import { KnownArticles, type ServiceRange } from "../../../../day/index.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import {
  article,
  FixedProductionArticles,
  FixedWorkstationOfProducts,
} from "../../__tests__/placement-doubles.js";
import { GetUnplacedProductsOfDayHandler } from "../get-unplaced-products-of-day.handler.js";
import { GetUnplacedProductsOfDayQuery } from "../get-unplaced-products-of-day.query.js";

/** Une journée quelconque : le handler ne la compare jamais à l'horloge. */
const DAY = "2026-11-18";
const SAVORY: CatalogFamilyView = { id: "fam-savory", name: "Traiteur salé", position: 1 };

class Known extends KnownArticles {
  readonly asked: ServiceRange[] = [];
  between(range: ServiceRange): Promise<readonly { sku: string; productName: string }[]> {
    this.asked.push(range);
    return Promise.resolve([{ sku: "TAR-1", productName: "Tarte" }]);
  }
}

class Orders extends ExpectedProductionReader {
  readonly asked: ServiceRange[] = [];
  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]> {
    this.asked.push(range);
    return Promise.resolve([
      {
        day: DAY,
        orderCount: 1,
        items: [{ sku: "QUI-8", productName: "Quiche 8", quantity: 2, saleUnit: "piece" }],
      },
    ]);
  }
}

class Resupplies extends ExpectedResuppliesReader {
  readonly asked: ServiceRange[] = [];
  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayResupplies[]> {
    this.asked.push(range);
    return Promise.resolve([
      {
        day: DAY,
        items: [{ sku: "GONE", productName: "Retirée", quantity: 1, saleUnit: "piece" }],
      },
    ]);
  }
}

function around(closed: boolean) {
  const known = new Known();
  const orders = new Orders();
  const resupplies = new Resupplies();
  const settings = new InMemoryDisplaySettings(
    ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }),
  );
  const handler = new GetUnplacedProductsOfDayHandler(
    new FixedStatus(closed),
    known,
    orders,
    resupplies,
    new FixedProductionArticles([article("QUI-8", "QUI", SAVORY), article("TAR-1", "TAR", SAVORY)]),
    new FixedWorkstationOfProducts([], new Map()),
    settings.reader(),
  );
  return { handler, known, orders, resupplies };
}

describe("GetUnplacedProductsOfDayHandler — l'alerte du Prod manager", () => {
  it("avant l'arrêt, lit la demande attendue du seul jour, commandes et réassorts", async () => {
    const { handler, known, orders, resupplies } = around(false);

    const view = await handler.execute(new GetUnplacedProductsOfDayQuery(DAY));

    expect(known.asked).toEqual([]);
    expect([orders.asked[0]?.from.value, orders.asked[0]?.to.value]).toEqual([DAY, DAY]);
    expect([resupplies.asked[0]?.from.value, resupplies.asked[0]?.to.value]).toEqual([DAY, DAY]);
    expect(view).toEqual({
      date: DAY,
      mode: "workstation",
      closed: false,
      products: [{ productSku: "QUI", productName: null, skus: ["QUI-8"] }],
      offCatalog: [{ sku: "GONE", productName: "Retirée" }],
    });
  });

  it("après l'arrêt, lit les lignes arrêtées du seul jour, et plus la demande", async () => {
    const { handler, known, orders, resupplies } = around(true);

    const view = await handler.execute(new GetUnplacedProductsOfDayQuery(DAY));

    expect([known.asked[0]?.from.value, known.asked[0]?.to.value]).toEqual([DAY, DAY]);
    expect(orders.asked).toEqual([]);
    expect(resupplies.asked).toEqual([]);
    expect(view.closed).toBe(true);
    expect(view.products.map((product) => product.productSku)).toEqual(["TAR"]);
  });
});
