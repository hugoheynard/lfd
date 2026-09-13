import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionPackingHandler } from "../get-production-packing.handler.js";
import { GetProductionPackingQuery } from "../get-production-packing.query.js";

/** Aucune comparaison à l'horloge : cet instant traverse la vue tel quel. */
const CLOSED_AT = new Date("2026-09-13T04:20:00.000Z");
const DAY = "2026-09-13";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

/**
 * Le dépôt doublé : il ÉTEND le port. Les trois écritures **rejettent** — une
 * lecture qui en appellerait une serait le bug qu'on cherche, et un double muet
 * le laisserait passer.
 */
class Days extends ProductionDayRepository {
  constructor(private readonly current: ProductionDay) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markPacked(): Promise<boolean> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markProduced(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], CLOSED_AT);
  return day;
}

describe("GetProductionPackingHandler", () => {
  it("rend les bacs et la ressource d'une journée arrêtée", async () => {
    const handler = new GetProductionPackingHandler(new Days(closedDay()));

    const view = await handler.execute(new GetProductionPackingQuery(DAY));

    expect(view.date).toBe(DAY);
    expect(view.closedAt).toBe(CLOSED_AT.toISOString());
    expect(view.sheets).toHaveLength(1);
    expect(view.sheets[0]?.reference).toBe("CMD-0001");
    expect(view.resources).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        produced: 12,
        allocated: 0,
        remaining: 12,
        // La journée vient d'être arrêtée : rien n'est encore sorti du four.
        awaitingProduction: true,
      },
    ]);
  });

  it("rend le VIDE sur une journée ouverte, et ne lève pas", async () => {
    // L'écran dit « plan non arrêté » ; lever ferait d'un jour ouvert trop tôt
    // une erreur, alors que c'est un état parfaitement normal à 3 h du matin.
    const handler = new GetProductionPackingHandler(
      new Days(ProductionDay.open(ServiceDay.of(DAY))),
    );

    const view = await handler.execute(new GetProductionPackingQuery(DAY));

    expect(view).toEqual({ date: DAY, closedAt: null, sheets: [], resources: [] });
  });

  it("refuse un jour qui n'en est pas un — c'est le domaine qui tranche", async () => {
    const handler = new GetProductionPackingHandler(new Days(closedDay()));

    await expect(handler.execute(new GetProductionPackingQuery("08/09/2026"))).rejects.toThrow();
  });
});
