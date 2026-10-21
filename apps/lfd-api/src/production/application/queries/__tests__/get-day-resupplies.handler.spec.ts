import { instantToLocal } from "@lfd/contracts";

import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { DayResupplies } from "../../__tests__/settings-doubles.js";
import { GetDayResuppliesHandler } from "../get-day-resupplies.handler.js";
import { GetDayResuppliesQuery } from "../get-day-resupplies.query.js";

/**
 * **Les réassorts au dossier du jour** : la copie figée d'une journée
 * arrêtée, l'envoyé vivant d'une journée ouverte. Le jour est dérivé de
 * maintenant ; l'instant de clôture n'est jamais comparé à l'horloge.
 */
const NOW = new Date();
const DAY = instantToLocal(NOW).day;

function resupply(resupplyId: string, quantity: number): PlacedResupply {
  return {
    resupplyId,
    siteId: "site-v",
    siteLabel: "Village",
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity }],
  };
}

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-1",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  clientele: null,
  siteId: null,
  sheetDetails: null,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

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

describe("GetDayResuppliesHandler", () => {
  it("rend l'envoyé « pour demain » d'une journée ouverte, non figé", async () => {
    const trace: string[] = [];
    const handler = new GetDayResuppliesHandler(
      new Days(ProductionDay.open(ServiceDay.of(DAY))),
      new DayResupplies([resupply("r-1", 18)], trace),
    );
    const view = await handler.execute(new GetDayResuppliesQuery(DAY));
    expect(view).toEqual({ date: DAY, frozen: false, resupplies: [resupply("r-1", 18)] });
    expect(trace).toEqual([`resupplies:${DAY}`]);
  });

  it("rend la copie figée d'une journée arrêtée, sans relire le commerce", async () => {
    const day = ProductionDay.open(ServiceDay.of(DAY));
    day.close([ORDER], new Set<string>(), NOW, null, [resupply("r-1", 18)]);
    const trace: string[] = [];
    const handler = new GetDayResuppliesHandler(
      new Days(day),
      new DayResupplies([resupply("r-2", 99)], trace),
    );
    const view = await handler.execute(new GetDayResuppliesQuery(DAY));
    expect(view).toEqual({ date: DAY, frozen: true, resupplies: [resupply("r-1", 18)] });
    expect(trace).toEqual([]);
  });
});
