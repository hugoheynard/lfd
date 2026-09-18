import { addDays, instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { GetProductionPackingHandler } from "../get-production-packing.handler.js";
import { GetProductionPackingQuery } from "../get-production-packing.query.js";
import { FixedStaffAuthorDirectory } from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";

/**
 * Aucune date absolue comparée à l'horloge : les jours sont DÉRIVÉS de
 * l'instant de l'horloge figée, qui est lui-même maintenant. `CLOSED_AT` n'est
 * que recopié dans la vue.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const CLOSED_AT = new Date(NOW.getTime() - 60 * 60 * 1000);

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

/**
 * Le dépôt doublé : il ÉTEND le port. Les écritures **rejettent** — une lecture
 * qui en appellerait une serait le bug qu'on cherche, et un double muet le
 * laisserait passer.
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

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }
}

function closedDay(day: string): ProductionDay {
  const production = ProductionDay.open(ServiceDay.of(day));
  production.close([ORDER], CLOSED_AT);
  return production;
}

describe("GetProductionPackingHandler", () => {
  it("rend les bacs, la ressource et les compteurs d'une journée arrêtée", async () => {
    const handler = new GetProductionPackingHandler(
      new Days(closedDay(TODAY)),
      new FixedClock(NOW),
      new FixedStaffAuthorDirectory(),
    );

    const view = await handler.execute(new GetProductionPackingQuery(TODAY));

    expect(view.date).toBe(TODAY);
    expect(view.closedAt).toBe(CLOSED_AT.toISOString());
    expect(view.sheets).toHaveLength(1);
    expect(view.sheets[0]?.reference).toBe("CMD-0001");
    expect(view).toMatchObject({ orderCount: 1, todoCount: 1, readyCount: 0 });
    expect(view.resources).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        produced: 12,
        allocated: 0,
        remaining: 12,
        // La journée vient d'être arrêtée : rien n'est encore sorti du four.
        awaitingProduction: true,
        exhausted: false,
      },
    ]);
  });

  it("dit « aujourd'hui » selon l'horloge du SERVEUR, pas celle du poste", async () => {
    const handler = new GetProductionPackingHandler(
      new Days(closedDay(TODAY)),
      new FixedClock(NOW),
      new FixedStaffAuthorDirectory(),
    );

    expect((await handler.execute(new GetProductionPackingQuery(TODAY))).relativeDay).toBe("today");
  });

  it("dit « demain » quand l'horloge avance d'un jour… vers la veille", async () => {
    const tomorrow = addDays(TODAY, 1);
    const handler = new GetProductionPackingHandler(
      new Days(closedDay(tomorrow)),
      new FixedClock(NOW),
      new FixedStaffAuthorDirectory(),
    );

    expect((await handler.execute(new GetProductionPackingQuery(tomorrow))).relativeDay).toBe(
      "tomorrow",
    );
  });

  it("rend le VIDE sur une journée ouverte, compteurs à zéro, et ne lève pas", async () => {
    // L'écran dit « plan non arrêté » ; lever ferait d'un jour ouvert trop tôt
    // une erreur, alors que c'est un état parfaitement normal à 3 h du matin.
    const handler = new GetProductionPackingHandler(
      new Days(ProductionDay.open(ServiceDay.of(TODAY))),
      new FixedClock(NOW),
      new FixedStaffAuthorDirectory(),
    );

    const view = await handler.execute(new GetProductionPackingQuery(TODAY));

    expect(view).toEqual({
      date: TODAY,
      closedAt: null,
      sheets: [],
      resources: [],
      orderCount: 0,
      todoCount: 0,
      readyCount: 0,
      // Calculé quand même : « le plan de demain n'est pas arrêté » se dit.
      relativeDay: "today",
    });
  });

  it("refuse un jour qui n'en est pas un — c'est le domaine qui tranche", async () => {
    const handler = new GetProductionPackingHandler(
      new Days(closedDay(TODAY)),
      new FixedClock(NOW),
      new FixedStaffAuthorDirectory(),
    );

    await expect(handler.execute(new GetProductionPackingQuery("08/09/2026"))).rejects.toThrow();
  });
});
