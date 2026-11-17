import { instantToLocal, type CatalogFamilyView } from "@lfd/contracts";

import { FixedDueThresholds } from "../../../../channels/commerce/__tests__/due-thresholds-doubles.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../../channels/commerce/day-orders.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../../../channels/commerce/workshop-shelves.reader.js";
import { InMemoryTrancheSettings } from "../../../../day/application/__tests__/production-tranche-settings-doubles.js";
import {
  BAGUETTE,
  CROISSANT,
  closedDay,
} from "../../../../day/application/__tests__/closed-day-doubles.js";
import { type ProductionDay, ProductionDayRepository, ServiceDay } from "../../../../day/index.js";
import {
  CheckTable,
  qualityLinesFrom,
} from "../../../../quality/application/__tests__/quality-doubles.js";
import { CapturedLogs } from "../../../../shared/print/application/__tests__/captured-logs.js";
import { InMemoryDisplaySettings } from "../../../../shared/print/application/__tests__/production-display-settings-doubles.js";
import { ProductionDisplaySettings } from "../../../../shared/print/index.js";
import {
  FailingWorkstationOfProducts,
  FixedWorkstationOfProducts,
  UnreadWorkstationOfProducts,
  article,
  placementPorts,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { WorkstationOfProducts } from "../../../../workstations/index.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { FixedOvenWaitingOrders } from "../../__tests__/oven-waiting-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";

/**
 * **La fiche selon le mode** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.4) : le mode boutique ne lit pas les postes, le mode prod range par
 * poste, et une panne des postes range par rayon en le journalisant. Le jour
 * est dérivé de maintenant. Le croissant est rangé, pour l'épreuve, au
 * « Traiteur salé ».
 */
const NOW = new Date();
const DAY = ServiceDay.of(instantToLocal(NOW).day);
const TIRAGE = new Date(NOW.getTime() - 60 * 60 * 1000);
const SALTY: CatalogFamilyView = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };

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

class Shelves extends WorkshopShelvesReader {
  calls = 0;
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    this.calls += 1;
    return Promise.resolve(
      new Map([
        [CROISSANT, SALTY],
        [BAGUETTE, BREADS],
      ]),
    );
  }
}

const ARTICLES = [article(CROISSANT, "VIE", SALTY), article(BAGUETTE, "PAI", BREADS)];

function subject(grouping: "shelf" | "workstation", workstations: WorkstationOfProducts) {
  const shelves = new Shelves();
  const display = new InMemoryDisplaySettings(
    ProductionDisplaySettings.of({ showSubcategories: false, grouping }),
  );
  const reading = new ProductionWorksheetReading(
    new Days(closedDay(DAY, TIRAGE, [])),
    new NoDemand(),
    new NoOrders(),
    new NoContainers(),
    new WorksheetDeadlinesReading(new FixedDueThresholds(), new InMemoryTrancheSettings().reader()),
    qualityLinesFrom(new CheckTable()),
    new FixedOvenWaitingOrders(),
    display.reader(),
    new GroupingSourceReading(shelves, ...placementPorts(ARTICLES, workstations)),
  );
  return { reading, shelves };
}

describe("ProductionWorksheetReading — mode boutique, mode prod", () => {
  it("le mode boutique range par rayon sans lire les postes", async () => {
    const workstations = new UnreadWorkstationOfProducts();
    const { reading, shelves } = subject("shelf", workstations);

    const content = await reading.contentOf(DAY);

    expect(content.sheet.groups.map((group) => [group.key, group.kind])).toEqual([
      ["fam-bread", "shelf"],
      ["fam-salty", "shelf"],
    ]);
    expect(workstations.calls).toBe(0);
    expect(shelves.calls).toBe(1);
    expect(content.complete).toBe(true);
  });

  it("le mode prod range par poste, sans lire les rayons de la vente", async () => {
    const { reading, shelves } = subject(
      "workstation",
      new FixedWorkstationOfProducts(
        [{ id: "ws_pastry", name: "Pâtisserie", position: 0 }],
        new Map([["VIE", "ws_pastry"]]),
      ),
    );

    const content = await reading.contentOf(DAY);

    expect(content.sheet.groups.map((group) => [group.key, group.label, group.unplaced])).toEqual([
      ["ws:ws_pastry", "Pâtisserie", false],
      ["fam-bread", "Pains — à ranger", true],
    ]);
    expect(shelves.calls).toBe(0);
    expect(content.sheet.shelvesKnown).toBe(true);
    expect(content.complete).toBe(true);
  });

  it("une panne des postes range par rayon, journalisée, et la fiche n'est pas complète", async () => {
    const logs = CapturedLogs.capture();
    try {
      const { reading, shelves } = subject("workstation", new FailingWorkstationOfProducts());

      const content = await reading.contentOf(DAY);

      expect(content.sheet.groups.map((group) => [group.key, group.kind])).toEqual([
        ["fam-bread", "shelf"],
        ["fam-salty", "shelf"],
      ]);
      expect(shelves.calls).toBe(1);
      expect(content.complete).toBe(false);
      expect(logs.errors).toEqual([
        expect.stringContaining("postes illisibles, servie rangée par rayon"),
      ]);
    } finally {
      logs.release();
    }
  });
});
