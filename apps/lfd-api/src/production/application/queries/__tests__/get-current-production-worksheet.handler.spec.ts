import { addDays, instantToLocal, localToInstant, type CatalogCategory } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { ProductionWorksheetReading } from "../../services/production-worksheet-reading.service.js";
import { GetCurrentProductionWorksheetHandler } from "../get-current-production-worksheet.handler.js";

/**
 * **La fiche en cours** : demain si son plan est arrêté, aujourd'hui sinon.
 *
 * Les jours sont DÉRIVÉS de maintenant — la règle les compare à l'horloge, et
 * un jour en dur la ferait basculer d'elle-même au prochain minuit.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const TOMORROW = addDays(TODAY, 1);

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

/**
 * Le dépôt doublé : une journée par jour, ouverte si on ne l'a pas posée. Les
 * écritures **rejettent** — une lecture qui en appellerait une serait le bug.
 */
class Days extends ProductionDayRepository {
  readonly loaded: string[] = [];

  constructor(private readonly closed: ReadonlyMap<string, ProductionDay>) {
    super();
  }

  load(day: ServiceDay): Promise<ProductionDay> {
    this.loaded.push(day.value);
    return Promise.resolve(this.closed.get(day.value) ?? ProductionDay.open(day));
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

class NoOrders extends DayOrdersReader {
  producibleFor(): Promise<readonly ProducibleOrder[]> {
    return Promise.resolve([]);
  }
}

class NoDemand extends ExpectedProductionReader {
  expectedBetween(): Promise<readonly ExpectedDayProduction[]> {
    return Promise.resolve([]);
  }
}

class NoContainers extends ProductionContainerReader {
  allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    return Promise.resolve(new Map());
  }
}

class NoShelves extends WorkshopShelvesReader {
  shelvesOf(): Promise<ReadonlyMap<string, CatalogCategory>> {
    return Promise.resolve(new Map());
  }
}

function closedOn(day: string): ProductionDay {
  const production = ProductionDay.open(ServiceDay.of(day));
  production.close([ORDER], new Date(NOW.getTime() - 60 * 60 * 1000));
  return production;
}

function handlerFor(days: Days, now: Date = NOW): GetCurrentProductionWorksheetHandler {
  const clock = new FixedClock(now);
  const reading = new ProductionWorksheetReading(
    days,
    new NoDemand(),
    new NoOrders(),
    new NoContainers(),
    new NoShelves(),
    clock,
  );
  return new GetCurrentProductionWorksheetHandler(days, reading, clock);
}

describe("GetCurrentProductionWorksheetHandler", () => {
  it("sert DEMAIN quand son plan est arrêté", async () => {
    const view = await handlerFor(new Days(new Map([[TOMORROW, closedOn(TOMORROW)]]))).execute();

    expect(view.date).toBe(TOMORROW);
    expect(view.relativeDay).toBe("tomorrow");
    expect(view.lines).toHaveLength(1);
  });

  it("sert AUJOURD'HUI tant que rien n'est arrêté pour demain", async () => {
    const days = new Days(new Map());

    const view = await handlerFor(days).execute();

    expect(days.loaded[0]).toBe(TOMORROW);
    expect(view.date).toBe(TODAY);
    expect(view.relativeDay).toBe("today");
  });

  it("sert aujourd'hui même si AUJOURD'HUI est arrêté et demain ne l'est pas", async () => {
    const view = await handlerFor(new Days(new Map([[TODAY, closedOn(TODAY)]]))).execute();

    expect(view.date).toBe(TODAY);
    expect(view.generatedAt).not.toBeNull();
  });

  it("🔴 lit « demain » au jour de PARIS, pas en UTC", () => {
    // À 00 h 30 à Paris l'été, il est 22 h 30 UTC la VEILLE : un calcul en UTC
    // servirait la fiche d'aujourd'hui en la prenant pour demain.
    const justAfterMidnight = localToInstant(TOMORROW, "00:30");
    if (justAfterMidnight === null) {
      throw new Error("00:30 existe tous les jours à Paris — le changement d'heure est à 02:00.");
    }
    const dayAfter = addDays(TOMORROW, 1);
    const days = new Days(new Map([[dayAfter, closedOn(dayAfter)]]));

    return handlerFor(days, justAfterMidnight)
      .execute()
      .then((view) => {
        expect(days.loaded[0]).toBe(dayAfter);
        expect(view.date).toBe(dayAfter);
      });
  });
});
