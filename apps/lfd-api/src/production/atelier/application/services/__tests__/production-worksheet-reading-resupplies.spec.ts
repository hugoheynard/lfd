import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import { instantToLocal } from "@lfd/contracts";

import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../../channels/commerce/day-resupplies.reader.js";
import type { DayDueThresholds } from "../../../../channels/commerce/due-thresholds.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../../channels/commerce/expected-production.reader.js";
import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import {
  ProductionDayRepository,
  ProductionTrancheSettings,
  ServiceDay,
} from "../../../../day/index.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { FixedOvenWaitingOrders } from "../../__tests__/oven-waiting-doubles.js";
import { FixedDueThresholds } from "../../../../channels/commerce/__tests__/due-thresholds-doubles.js";
import { ExpectedResupplies } from "../../../../channels/commerce/__tests__/expected-resupplies-doubles.js";
import { InMemoryTrancheSettings } from "../../../../day/application/__tests__/production-tranche-settings-doubles.js";
import {
  CheckTable,
  qualityLinesFrom,
} from "../../../../quality/application/__tests__/quality-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";
import { placementPorts } from "../../../../workstations/application/__tests__/placement-doubles.js";
import { trackingPorts } from "../../__tests__/tracking-doubles.js";
import { InMemoryProblems } from "../../__tests__/problem-doubles.js";

/**
 * La demande d'une journée OUVERTE compte les réassorts « pour demain »
 * envoyés, comme le compte à rebours (plan de l'heure du réassort, H3c) ;
 * celle d'une journée arrêtée vient du compte figé, qui les porte déjà.
 * Le jour est dérivé de maintenant ; les heures ne sont comparées qu'entre elles.
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);
const SEIGLE = "PAI-SEI";

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

class Demand extends ExpectedProductionReader {
  constructor(private readonly days: readonly ExpectedDayProduction[]) {
    super();
  }
  expectedBetween(): Promise<readonly ExpectedDayProduction[]> {
    return Promise.resolve(this.days);
  }
}

class NoContainers extends ProductionContainerReader {
  allBySku(): Promise<ReadonlyMap<string, ContainerRule>> {
    return Promise.resolve(new Map());
  }
}

const SEIGLE_ITEM = { sku: SEIGLE, productName: "Pain de seigle", saleUnit: "piece" as const };

/** Le commerce : 30 seigles commandés pour 09:30, un réassort de 6 pour 04:15. */
const DUE: DayDueThresholds = {
  deliveryMarginMinutes: 50,
  pickupMarginMinutes: 20,
  items: [
    {
      sku: SEIGLE,
      productName: "Pain de seigle",
      total: 36,
      thresholds: [
        { kind: "deadline", before: "04:15", quantity: 6, cumulative: 6 },
        { kind: "deadline", before: "09:30", quantity: 30, cumulative: 36 },
      ],
    },
  ],
};

const RESUPPLY: PlacedResupply = {
  resupplyId: "rsp_1",
  siteId: "site_village",
  siteLabel: "Village",
  name: null,
  servedByTransfer: true,
  arrivalBy: "05:30",
  lines: [{ ...SEIGLE_ITEM, quantity: 6 }],
};

function readingOf(day: ProductionDay): ProductionWorksheetReading {
  const settings = new InMemoryTrancheSettings(
    ProductionTrancheSettings.set("fixed", ["04:15", "09:30"]),
  );
  return new ProductionWorksheetReading(
    new Days(day),
    new Demand([{ day: DAY.value, items: [{ ...SEIGLE_ITEM, quantity: 30 }], orderCount: 1 }]),
    new ExpectedResupplies([{ day: DAY.value, items: [{ ...SEIGLE_ITEM, quantity: 6 }] }]),
    new NoOrders(),
    new NoContainers(),
    new WorksheetDeadlinesReading(new FixedDueThresholds(DUE), settings.reader()),
    qualityLinesFrom(new CheckTable()),
    new FixedOvenWaitingOrders(),
    new InMemoryDisplaySettings().reader(),
    new GroupingSourceReading(...placementPorts()),
    ...trackingPorts(),
    new InMemoryProblems().dayReader(),
  );
}

describe("ProductionWorksheetReading — les réassorts dans la demande (H3c)", () => {
  /**
   * Régression : avant l'arrêt, la demande ne comptait que les commandes ; un
   * réassort au compte à rebours y aurait rogné les paliers des commandes.
   */
  it("avant l'arrêt, la ligne compte le réassort, et les paliers des commandes ne sont pas rognés", async () => {
    const { sheet } = await readingOf(ProductionDay.open(DAY)).contentOf(DAY);

    const seigle = sheet.lines.find((line) => line.sku === SEIGLE);
    expect(seigle?.quantity).toBe(36);
    expect(seigle?.deadlines).toEqual([
      { quantity: 6, before: "04:15" },
      { quantity: 30, before: "09:30" },
    ]);
  });

  it("après l'arrêt, la quantité vient du compte figé, sans compter le réassort deux fois", async () => {
    const day = ProductionDay.open(DAY);
    day.close(
      [producibleOrder("ord_1", { lines: [orderLine(SEIGLE, 30)] })],
      new Set<string>(),
      TIRAGE,
      null,
      [RESUPPLY],
    );

    const { sheet } = await readingOf(day).contentOf(DAY);

    const seigle = sheet.lines.find((line) => line.sku === SEIGLE);
    expect(seigle?.quantity).toBe(36);
    expect(seigle?.deadlines?.reduce((sum, step) => sum + step.quantity, 0)).toBe(36);
  });
});
