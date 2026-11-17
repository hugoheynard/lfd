import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import { instantToLocal, type ProductionWorksheetView } from "@lfd/contracts";

import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../../channels/commerce/day-orders.reader.js";
import type { DayDueThresholds } from "../../../../channels/commerce/due-thresholds.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../../channels/commerce/expected-production.reader.js";
import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import { ProductionTrancheSettings } from "../../../../day/index.js";
import { QualityCheck } from "../../../../quality/domain/entities/quality-check.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../../day/index.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../../day/index.js";
import { FixedOvenWaitingOrders } from "../../__tests__/oven-waiting-doubles.js";
import { FixedDueThresholds } from "../../../../channels/commerce/__tests__/due-thresholds-doubles.js";
import { InMemoryTrancheSettings } from "../../../../day/application/__tests__/production-tranche-settings-doubles.js";
import {
  CheckTable,
  qualityLinesFrom,
} from "../../../../quality/application/__tests__/quality-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { servedWorksheet } from "../worksheet-content.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import { trackingPorts } from "../../__tests__/tracking-doubles.js";
import { InMemoryProblems } from "../../__tests__/problem-doubles.js";

/**
 * Les paliers et la pastille qualité d'une ligne de la fiche (plan
 * `documentation/fournil/la-fiche-d-atelier.md`, §2–§3). Le jour est dérivé de
 * maintenant ; les heures `HH:mm` des besoins ne sont comparées qu'entre elles.
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);
const SEIGLE = "PAI-SEI";
const BAGUETTE = "PAI-BAG";

function order(orderId: string, sku: string, quantity: number): ProducibleOrder {
  return producibleOrder(orderId, { lines: [orderLine(sku, quantity)] });
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

/** La fiche servie à maintenant — le contenu, puis ce qui dépend de l'heure. */
function readingWith(
  due: DayDueThresholds | "down",
  checks: CheckTable,
  waiting: FixedOvenWaitingOrders = new FixedOvenWaitingOrders(),
  problems: InMemoryProblems = new InMemoryProblems(),
): { read(day: ServiceDay): Promise<ProductionWorksheetView> } {
  const reading = bareReading(due, checks, waiting, problems);
  return { read: async (day) => servedWorksheet(await reading.contentOf(day), NOW) };
}

function bareReading(
  due: DayDueThresholds | "down",
  checks: CheckTable,
  waiting: FixedOvenWaitingOrders = new FixedOvenWaitingOrders(),
  problems: InMemoryProblems = new InMemoryProblems(),
): ProductionWorksheetReading {
  const settings = new InMemoryTrancheSettings(
    ProductionTrancheSettings.set("fixed", ["05:00", "07:00"]),
  );
  return new ProductionWorksheetReading(
    new Days(closedDay()),
    new NoDemand(),
    new NoOrders(),
    new NoContainers(),
    new WorksheetDeadlinesReading(new FixedDueThresholds(due), settings.reader()),
    qualityLinesFrom(checks),
    waiting,
    new InMemoryDisplaySettings().reader(),
    new GroupingSourceReading(...placementPorts()),
    ...trackingPorts(),
    problems.dayReader(),
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

  it("SERT la fiche quand les besoins sont illisibles — sans paliers", async () => {
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

describe("ProductionWorksheetReading — ce qui attend le four (§3)", () => {
  it("pose sur la ligne les commandes qui attendent le four, et rien ailleurs", async () => {
    const waiting = new FixedOvenWaitingOrders(
      new Map([[SEIGLE, { count: 2, earliestHandover: "08:45" }]]),
    );

    const view = await readingWith(DUE, new CheckTable(), waiting).read(DAY);

    expect(view.lines.find((line) => line.sku === SEIGLE)?.waitingOrders).toEqual({
      count: 2,
      earliestHandover: "08:45",
    });
    expect(view.lines.find((line) => line.sku === BAGUETTE)?.waitingOrders).toBeNull();
    const grouped = view.groups.flatMap((group) => group.lines);
    expect(grouped.find((line) => line.sku === SEIGLE)?.waitingOrders?.count).toBe(2);
  });

  it("SERT la fiche quand le colisage ne répond pas — `null` partout", async () => {
    const view = await readingWith(DUE, new CheckTable(), new FixedOvenWaitingOrders("down")).read(
      DAY,
    );

    expect(view.lines).toHaveLength(2);
    expect(view.lines.every((line) => line.waitingOrders === null)).toBe(true);
    expect(view.lines.find((line) => line.sku === SEIGLE)?.deadlines).toHaveLength(2);
  });
});

/** Un rouge sur une ligne de la journée, rangé tel que le dépôt le relit. */
function reported(
  problems: InMemoryProblems,
  sku: string,
  produced: number,
  resolved: boolean,
): void {
  const mark = { at: TIRAGE, staffId: "staff_1", name: "Léa" };
  problems.rows.set(`pb_${sku}`, {
    id: `pb_${sku}`,
    serviceDay: DAY.value,
    sku,
    expected: 30,
    produced,
    reason: "brûlé",
    reported: mark,
    resolved: resolved ? mark : null,
    version: 2,
  });
}

describe("ProductionWorksheetReading — plafond et rouge ouvert (niveaux de suivi, § 3.2)", () => {
  it("sert le plafond, le reste sous le plafond et le rouge ouvert de la ligne", async () => {
    const problems = new InMemoryProblems();
    reported(problems, SEIGLE, 18, false);
    const sheet = await readingWith(DUE, new CheckTable(), undefined, problems).read(DAY);
    const seigle = sheet.lines.find((line) => line.sku === SEIGLE);
    expect(seigle).toMatchObject({
      ceiling: 18,
      remainingUnderCeiling: 18,
      problem: {
        id: `pb_${SEIGLE}`,
        version: 2,
        expected: 30,
        produced: 18,
        reason: "brûlé",
        reportedAt: TIRAGE.toISOString(),
      },
    });
  });

  it("garde le plafond d'un rouge traité, sans plus le montrer ouvert", async () => {
    const problems = new InMemoryProblems();
    reported(problems, SEIGLE, 18, true);
    const sheet = await readingWith(DUE, new CheckTable(), undefined, problems).read(DAY);
    expect(sheet.lines.find((line) => line.sku === SEIGLE)).toMatchObject({
      ceiling: 18,
      remainingUnderCeiling: 18,
      problem: null,
    });
  });

  it("une ligne sans rouge n'a ni plafond ni problème, et son reste est le reste", async () => {
    const problems = new InMemoryProblems();
    reported(problems, SEIGLE, 18, false);
    const sheet = await readingWith(DUE, new CheckTable(), undefined, problems).read(DAY);
    expect(sheet.lines.find((line) => line.sku === BAGUETTE)).toMatchObject({
      ceiling: null,
      remainingUnderCeiling: 12,
      problem: null,
    });
  });
});
