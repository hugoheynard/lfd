import { InMemoryProblems } from "../../__tests__/problem-doubles.js";
import { instantToLocal, type CatalogFamilyView, type WorkshopLine } from "@lfd/contracts";

import { FixedDueThresholds } from "../../../../channels/commerce/__tests__/due-thresholds-doubles.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../../channels/commerce/day-orders.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
} from "../../../../channels/commerce/expected-production.reader.js";
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
  FixedProductionArticles,
} from "../../../../workstations/application/__tests__/placement-doubles.js";
import type { WorkstationOfProducts } from "../../../../workstations/index.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { FixedOvenWaitingOrders } from "../../__tests__/oven-waiting-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { GroupingSourceReading } from "../../../../workstations/index.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";
import {
  InMemoryTrackingSettings,
  type TrackingScene,
  trackingPorts,
} from "../../__tests__/tracking-doubles.js";
import { ProductionTrackingSettings } from "../../../domain/entities/production-tracking-settings.js";
import { ExpectedResupplies } from "../../../../channels/commerce/__tests__/expected-resupplies-doubles.js";

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

// La baguette ne se vend plus (masquée, réservée ou retirée) : le fournil est
// agnostique de la vente (Hugo, 2026-11-17), elle garde son rayon dans les deux modes.
const ARTICLES = [
  article(CROISSANT, "VIE", SALTY),
  { ...article(BAGUETTE, "PAI", BREADS), sellable: false },
];

function subject(
  grouping: "shelf" | "workstation",
  workstations: WorkstationOfProducts,
  tracking: TrackingScene = {},
) {
  const articles = new FixedProductionArticles(ARTICLES);
  const groupingReading = new GroupingSourceReading(articles, workstations);
  const display = new InMemoryDisplaySettings(
    ProductionDisplaySettings.of({ showSubcategories: false, grouping }),
  );
  const reading = new ProductionWorksheetReading(
    new Days(closedDay(DAY, TIRAGE, [])),
    new NoDemand(),
    new ExpectedResupplies(),
    new NoOrders(),
    new NoContainers(),
    new WorksheetDeadlinesReading(new FixedDueThresholds(), new InMemoryTrancheSettings().reader()),
    qualityLinesFrom(new CheckTable()),
    new FixedOvenWaitingOrders(),
    display.reader(),
    groupingReading,
    ...trackingPorts(tracking, groupingReading),
    new InMemoryProblems().dayReader(),
  );
  return { reading, articles };
}

describe("ProductionWorksheetReading — mode boutique, mode prod", () => {
  it("le mode boutique range par rayon sans lire les postes", async () => {
    const workstations = new UnreadWorkstationOfProducts();
    const { reading, articles } = subject("shelf", workstations);

    const content = await reading.contentOf(DAY);

    expect(content.sheet.groups.map((group) => [group.key, group.kind])).toEqual([
      ["fam-bread", "shelf"],
      ["fam-salty", "shelf"],
    ]);
    expect(workstations.calls).toBe(0);
    expect(articles.asked).toHaveLength(1);
    expect(content.complete).toBe(true);
  });

  it("le mode prod range par poste, et par rayon « à ranger » le reste", async () => {
    const { reading, articles } = subject(
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
    expect(articles.asked).toHaveLength(1);
    expect(content.sheet.shelvesKnown).toBe(true);
    expect(content.complete).toBe(true);
  });

  it("une panne des postes range par rayon, journalisée, et la fiche n'est pas complète", async () => {
    const logs = CapturedLogs.capture();
    try {
      const { reading, articles } = subject("workstation", new FailingWorkstationOfProducts());

      const content = await reading.contentOf(DAY);

      expect(content.sheet.groups.map((group) => [group.key, group.kind])).toEqual([
        ["fam-bread", "shelf"],
        ["fam-salty", "shelf"],
      ]);
      expect(articles.asked).toHaveLength(2);
      expect(content.complete).toBe(false);
      expect(logs.errors).toEqual([
        expect.stringContaining("postes illisibles, servie rangée par rayon"),
      ]);
    } finally {
      logs.release();
    }
  });
});

describe("ProductionWorksheetReading — le niveau de suivi de chaque ligne", () => {
  const PASTRY_DETAILED: TrackingScene = {
    settings: new InMemoryTrackingSettings(
      ProductionTrackingSettings.of({ level: "simple", marginMinutes: 15 }),
    ),
    stations: [{ id: "ws_pastry", trackingLevel: "detailed" }],
  };
  const CROISSANT_ON_PASTRY = () =>
    new FixedWorkstationOfProducts(
      [{ id: "ws_pastry", name: "Pâtisserie", position: 0 }],
      new Map([["VIE", "ws_pastry"]]),
    );

  function levels(content: { sheet: { lines: readonly WorkshopLine[] } }) {
    return Object.fromEntries(content.sheet.lines.map((line) => [line.sku, line.trackingLevel]));
  }

  it("tous les postes au niveau du fournil : chaque ligne l'est, sans lire les postes", async () => {
    const workstations = new UnreadWorkstationOfProducts();
    const { reading } = subject("shelf", workstations);

    const content = await reading.contentOf(DAY);

    expect(levels(content)).toEqual({ [BAGUETTE]: "always_green", [CROISSANT]: "always_green" });
    expect(workstations.calls).toBe(0);
  });

  it("en mode boutique, la ligne d'un poste réglé prend son niveau, les autres celui du fournil", async () => {
    const { reading } = subject("shelf", CROISSANT_ON_PASTRY(), PASTRY_DETAILED);

    const content = await reading.contentOf(DAY);

    expect(levels(content)).toEqual({ [BAGUETTE]: "simple", [CROISSANT]: "detailed" });
    expect(content.complete).toBe(true);
  });

  it("en mode prod, le rangement déjà lu suffit", async () => {
    const workstations = CROISSANT_ON_PASTRY();
    const { reading } = subject("workstation", workstations, PASTRY_DETAILED);

    const content = await reading.contentOf(DAY);

    expect(levels(content)).toEqual({ [BAGUETTE]: "simple", [CROISSANT]: "detailed" });
    expect(workstations.asked).toHaveLength(1);
  });

  it("des postes illisibles servent les lignes en détaillé, et la fiche n'est pas gardée", async () => {
    const logs = CapturedLogs.capture();
    try {
      const { reading } = subject("shelf", new FailingWorkstationOfProducts(), PASTRY_DETAILED);

      const content = await reading.contentOf(DAY);

      expect(levels(content)).toEqual({ [BAGUETTE]: "detailed", [CROISSANT]: "detailed" });
      expect(content.complete).toBe(false);
      expect(logs.errors).toEqual([
        expect.stringContaining("niveaux de suivi des postes inconnus"),
      ]);
    } finally {
      logs.release();
    }
  });
});
