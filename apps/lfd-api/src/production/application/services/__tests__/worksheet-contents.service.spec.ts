import { type CatalogFamilyView, instantToLocal } from "@lfd/contracts";

import type { PackedContent } from "../../../../platform/day-versions/content-compression.js";
import {
  type DayContentAddress,
  DayContentsCache,
} from "../../../../platform/day-versions/day-contents-cache.js";
import { DayVersionRegistry } from "../../../../platform/day-versions/day-version-registry.js";
import { sources } from "../../../../platform/day-versions/__tests__/day-versions-doubles.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import {
  type ExpectedDayProduction,
  ExpectedProductionReader,
} from "../../../channels/commerce/expected-production.reader.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import type { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionContainerReader } from "../../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { FixedDueThresholds } from "../../__tests__/due-thresholds-doubles.js";
import { FixedOvenWaitingOrders } from "../../__tests__/oven-waiting-doubles.js";
import { InMemoryDisplaySettings } from "../../__tests__/production-display-settings-doubles.js";
import { InMemoryTrancheSettings } from "../../__tests__/production-tranche-settings-doubles.js";
import { CheckTable, closedDay, InMemoryCheckReader } from "../../__tests__/quality-doubles.js";
import { dayContentsOver } from "../../__tests__/worksheet-contents-doubles.js";
import { ProductionWorksheetReading } from "../production-worksheet-reading.service.js";
import { WorksheetContents } from "../worksheet-contents.service.js";
import { WorksheetDeadlinesReading } from "../worksheet-deadlines-reading.service.js";

/**
 * La fiche du fournil servie depuis l'objet des journées
 * (`le-cache-du-back-office.md`, § 3.1). Les jours sont dérivés de maintenant :
 * `relativeDay` les compare à l'horloge.
 */
const NOW = new Date();
const TODAY = instantToLocal(NOW).day;
const DAY = ServiceDay.of(TODAY);
const DAY_AFTER = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

class MemoryCache extends DayContentsCache {
  readonly kept = new Map<string, { readonly tag: string; readonly body: Uint8Array }>();
  readonly stored: DayContentAddress[] = [];

  read(address: DayContentAddress): Promise<Uint8Array | null> {
    const kept = this.kept.get(`${address.screen}/${address.day}`);
    return Promise.resolve(kept?.tag === address.tag ? kept.body : null);
  }

  store(address: DayContentAddress, content: PackedContent): Promise<void> {
    this.stored.push(address);
    this.kept.set(`${address.screen}/${address.day}`, { tag: address.tag, body: content.bytes });
    return Promise.resolve();
  }
}

/** La journée, qui note chaque lecture dans le journal partagé. */
class LoggedDays extends ProductionDayRepository {
  loads = 0;
  constructor(
    private readonly day: ProductionDay,
    private readonly log: string[],
  ) {
    super();
  }
  load(): Promise<ProductionDay> {
    this.loads += 1;
    this.log.push("data");
    return Promise.resolve(this.day);
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
  constructor(private readonly down: boolean) {
    super();
  }
  shelvesOf(): Promise<ReadonlyMap<string, CatalogFamilyView>> {
    return this.down
      ? Promise.reject(new Error("commerce injoignable"))
      : Promise.resolve(new Map());
  }
}

type Outage = "none" | "shelves" | "deadlines" | "waiting";

function around(outage: Outage = "none") {
  const log: string[] = [];
  const all = sources();
  for (const source of [all.orders, all.production]) {
    const versionOf = source.versionOf.bind(source);
    source.versionOf = (day: string) => {
      log.push(`version:${source.journal}`);
      return versionOf(day);
    };
  }
  const days = new LoggedDays(closedDay(DAY, NOW, []), log);
  const reading = new ProductionWorksheetReading(
    days,
    new NoDemand(),
    new NoOrders(),
    new NoContainers(),
    new Shelves(outage === "shelves"),
    new WorksheetDeadlinesReading(
      new FixedDueThresholds(outage === "deadlines" ? "down" : undefined),
      new InMemoryTrancheSettings().reader(),
    ),
    new InMemoryCheckReader(new CheckTable()),
    new FixedOvenWaitingOrders(outage === "waiting" ? "down" : undefined),
    new InMemoryDisplaySettings().reader(),
  );
  const cache = new MemoryCache();
  const clock = new FixedClock(NOW);
  const worksheets = new WorksheetContents(
    new DayVersionRegistry(Object.values(all)),
    dayContentsOver(cache),
    reading,
    clock,
  );
  return { worksheets, cache, clock, log, days, all };
}

/** Laisse partir le rangement, posé après la réponse. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}

describe("WorksheetContents", () => {
  it("lit les numéros `production` et `orders` AVANT les données", async () => {
    const { worksheets, log } = around();

    await worksheets.read(DAY);

    expect(log.indexOf("data")).toBeGreaterThan(log.indexOf("version:production"));
    expect(log.indexOf("data")).toBeGreaterThan(log.indexOf("version:orders"));
  });

  it("range la fiche sous la clé `worksheet`, étiquetée des deux numéros", async () => {
    const { worksheets, cache } = around();

    await worksheets.read(DAY);
    await settle();

    expect(cache.stored).toEqual([
      { screen: "worksheet", day: TODAY, tag: "orders:7.production:42" },
    ]);
  });

  it("sert la fiche rangée sans relire la base, à numéros égaux", async () => {
    const { worksheets, days } = around();

    const first = await worksheets.read(DAY);
    await settle();
    const second = await worksheets.read(DAY);

    expect(days.loads).toBe(1);
    expect(second).toEqual(first);
  });

  it("relit la base quand le numéro `orders` monte", async () => {
    const { worksheets, days, all } = around();

    await worksheets.read(DAY);
    await settle();
    all.orders.version += 1;
    await worksheets.read(DAY);

    expect(days.loads).toBe(2);
  });

  it("recalcule `relativeDay` à chaque réponse, même servie depuis l'objet", async () => {
    const { worksheets, days, clock } = around();

    const first = await worksheets.read(DAY);
    await settle();
    clock.set(DAY_AFTER);
    const second = await worksheets.read(DAY);

    expect(first.relativeDay).toBe("today");
    expect(second.relativeDay).toBeNull();
    expect(days.loads).toBe(1);
  });

  it.each<Outage>(["shelves", "deadlines", "waiting"])(
    "sert une fiche dégradée (%s en panne) sans jamais la ranger",
    async (outage) => {
      const { worksheets, cache, days } = around(outage);

      const view = await worksheets.read(DAY);
      await settle();
      await worksheets.read(DAY);

      expect(view.date).toBe(TODAY);
      expect(cache.stored).toHaveLength(0);
      expect(days.loads).toBe(2);
    },
  );
});
