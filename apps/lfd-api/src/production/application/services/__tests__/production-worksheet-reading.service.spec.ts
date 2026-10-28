import { instantToLocal, type CatalogFamilyView } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import type { DayDueThresholds } from "../../../channels/commerce/due-thresholds.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionTrancheSettings } from "../../../domain/entities/production-tranche-settings.js";
import { QualityCheck } from "../../../domain/entities/quality-check.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { FixedDueThresholds } from "../../__tests__/due-thresholds-doubles.js";
import { InMemoryTrancheSettings } from "../../__tests__/production-tranche-settings-doubles.js";
import { CheckTable, InMemoryCheckReader } from "../../__tests__/quality-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";

/**
 * Les paliers et la pastille qualité d'une ligne de la fiche (plan
 * `documentation/fournil/plan-fournee-v3.md`, §2–§3). Le jour est dérivé de
 * maintenant ; les heures `HH:mm` des besoins ne sont comparées qu'entre elles.
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);
const SEIGLE = "PAI-SEI";
const BAGUETTE = "PAI-BAG";

function order(orderId: string, sku: string, quantity: number): ProducibleOrder {
  return {
    orderId,
    reference: `ORD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku, productName: sku, quantity }],
  };
}

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
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    return Promise.resolve(new Map());
  }
}

/** Seigle 30 et baguette 12 au plan, arrêté il y a une heure. */
function closedDay(): ProductionDay {
  const day = ProductionDay.open(DAY);
  day.close(
    [order("ord_1", SEIGLE, 30), order("ord_2", BAGUETTE, 12)],
    new Set<string>(),
    TIRAGE,
    null,
  );
  return day;
}

/** Le seigle : 20 avant 06:40, 10 avant 09:30. La baguette n'a aucun besoin daté. */
const DUE: DayDueThresholds = {
  deliveryMarginMinutes: 30,
  pickupMarginMinutes: 30,
  items: [
    {
      sku: SEIGLE,
      productName: "Pain de seigle",
      total: 30,
      thresholds: [
        { kind: "deadline", before: "06:40", quantity: 20, cumulative: 20 },
        { kind: "deadline", before: "09:30", quantity: 10, cumulative: 30 },
      ],
    },
  ],
};

function readingWith(
  due: DayDueThresholds | "down",
  checks: CheckTable,
): ProductionWorksheetReading {
  const settings = new InMemoryTrancheSettings(
    ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]),
  );
  return new ProductionWorksheetReading(
    new Days(closedDay()),
    new NoDemand(),
    new NoOrders(),
    new NoContainers(),
    new NoShelves(),
    new FixedClock(NOW),
    new WorksheetDeadlinesReading(new FixedDueThresholds(due), settings.reader()),
    new InMemoryCheckReader(checks),
  );
}

function verdictOn(table: CheckTable, sku: string, quantitySeen: number): void {
  table.rows.set(
    "chk_1",
    QualityCheck.render({
      id: "chk_1",
      serviceDay: DAY,
      target: { kind: "line", sku, quantitySeen },
      verdict: "warning",
      note: "Croûte pâle",
      checkedBy: "staff_sup",
      checkedAt: NOW,
      photos: [],
    }),
  );
}

describe("ProductionWorksheetReading — paliers et contrôle qualité", () => {
  it("range les besoins dans les tranches de l'atelier, en paliers NON cumulés", async () => {
    const view = await readingWith(DUE, new CheckTable()).read(DAY);

    const seigle = view.lines.find((line) => line.sku === SEIGLE);
    expect(seigle?.deadlines).toEqual([
      { quantity: 20, before: "05:00" },
      { quantity: 10, before: "07:00" },
    ]);
  });

  it("une ligne sans besoin daté a un seul palier : la journée", async () => {
    const view = await readingWith(DUE, new CheckTable()).read(DAY);

    expect(view.lines.find((line) => line.sku === BAGUETTE)?.deadlines).toEqual([
      { quantity: 12, before: null },
    ]);
  });

  it("porte les mêmes paliers dans les groupes que dans la liste", async () => {
    const view = await readingWith(DUE, new CheckTable()).read(DAY);

    const grouped = view.groups.flatMap((group) => group.lines);
    expect(grouped.find((line) => line.sku === SEIGLE)?.deadlines).toHaveLength(2);
  });

  it("🔴 SERT la fiche quand les besoins sont illisibles — sans paliers", async () => {
    const view = await readingWith("down", new CheckTable()).read(DAY);

    expect(view.lines).toHaveLength(2);
    expect(view.lines.every((line) => line.deadlines?.length === 0)).toBe(true);
  });

  it("pose le verdict qualité courant du SKU, celui de la Supervision", async () => {
    const checks = new CheckTable();
    verdictOn(checks, SEIGLE, 30);

    const view = await readingWith(DUE, checks).read(DAY);

    expect(view.lines.find((line) => line.sku === SEIGLE)?.quality).toMatchObject({
      sku: SEIGLE,
      verdict: "warning",
      quantitySeen: 30,
      currentQuantity: 30,
      stale: false,
    });
    expect(view.lines.find((line) => line.sku === BAGUETTE)?.quality).toBeNull();
  });

  it("dit un verdict périmé quand le compte a bougé depuis le contrôle", async () => {
    const checks = new CheckTable();
    verdictOn(checks, SEIGLE, 24);

    const view = await readingWith(DUE, checks).read(DAY);

    expect(view.lines.find((line) => line.sku === SEIGLE)?.quality?.stale).toBe(true);
  });
});
