import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { closedDay } from "../../../../day/application/__tests__/closed-day-doubles.js";
import {
  type ProductionDay,
  ProductionDayLock,
  ProductionDayRepository,
  ServiceDay,
} from "../../../../day/index.js";
import { ProductionTrackingSettings } from "../../../domain/entities/production-tracking-settings.js";
import {
  FixedCommissioning,
  FixedWorkstationTrackingLevels,
  InMemoryFrozenLevels,
  InMemoryTrackingSettings,
} from "../../__tests__/tracking-doubles.js";
import { DayTrackingLevelsFreezing } from "../day-tracking-levels-freezing.service.js";
import { DayTrackingLevelsReading } from "../day-tracking-levels-reading.service.js";

/**
 * **Le niveau figé au premier passage** (
 * `fournil/les-niveaux-de-suivi.md`), ports doublés. L'arrêt et la
 * mise en service ne sont comparés qu'entre eux, jamais à l'horloge.
 */
const DAY = "2026-12-03";
const CLOSED_AT = new Date("2026-12-02T20:00:00.000Z");
const FROZEN_AT = new Date("2026-12-02T20:05:00.000Z");
const SINCE_BEFORE = new FixedCommissioning(new Date("2026-12-01T00:00:00.000Z"));
const SINCE_AFTER = new FixedCommissioning(new Date("2026-12-05T00:00:00.000Z"));

/** La journée arrêtée, relue telle quelle ; chaque relecture se note au fil. */
class TracedDays extends ProductionDayRepository {
  constructor(
    private readonly current: ProductionDay,
    private readonly trace: string[],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("figer le niveau ne sauve pas la journée"));
  }
}

/** Le verrou de la journée : il se note au fil. */
class TracedLock extends ProductionDayLock {
  constructor(private readonly trace: string[]) {
    super();
  }

  lock(day: ServiceDay): Promise<void> {
    this.trace.push(`lock:${day.value}`);
    return Promise.resolve();
  }
}

function scene(options: { since?: FixedCommissioning } = {}) {
  const trace: string[] = [];
  const settings = new InMemoryTrackingSettings(
    ProductionTrackingSettings.of({ level: "simple", marginMinutes: 15 }),
  );
  const stations = new FixedWorkstationTrackingLevels([
    { id: "ws-pastry", trackingLevel: "detailed" },
    { id: "ws-bread", trackingLevel: null },
  ]);
  const frozen = new InMemoryFrozenLevels(trace);
  const lock = new TracedLock(trace);
  const since = options.since ?? SINCE_BEFORE;
  const reading = new DayTrackingLevelsReading(frozen.reader(), settings.reader(), stations, since);
  const freezing = new DayTrackingLevelsFreezing(
    new DirectUnitOfWork(),
    lock,
    new TracedDays(closedDay(ServiceDay.of(DAY), CLOSED_AT, []), trace),
    frozen.reader(),
    frozen.freezer(),
    reading,
    since,
    new FixedClock(FROZEN_AT),
  );
  return { trace, settings, stations, frozen, reading, freezing };
}

describe("DayTrackingLevelsFreezing — le premier passage fige", () => {
  it("sous le verrou, relue sous lui, fige le fournil et chaque poste résolus", async () => {
    const { freezing, frozen, trace } = scene();

    const levels = await freezing.freezeIfDue(ServiceDay.of(DAY));

    expect(levels.house).toBe("simple");
    expect([...levels.workstations]).toEqual([
      ["ws-pastry", "detailed"],
      ["ws-bread", "simple"],
    ]);
    expect(frozen.rows.get(DAY)).toEqual(levels);
    expect(trace.slice(0, 2)).toEqual([`lock:${DAY}`, "load"]);
    expect(trace).toContain(`freeze:${DAY}`);
  });

  it("le second passage ne réécrit rien : un réglage changé vaut pour la journée suivante", async () => {
    const { freezing, frozen, settings } = scene();
    await freezing.freezeIfDue(ServiceDay.of(DAY));
    settings.current = ProductionTrackingSettings.of({ level: "always_green", marginMinutes: 15 });

    const levels = await freezing.freezeIfDue(ServiceDay.of(DAY));

    expect(levels.house).toBe("simple");
    expect(frozen.attempts).toEqual([DAY]);
  });

  it("une journée arrêtée avant la mise en service reste en détaillé, jamais figée", async () => {
    const { freezing, frozen } = scene({ since: SINCE_AFTER });

    const levels = await freezing.freezeIfDue(ServiceDay.of(DAY));

    expect(levels).toEqual({ house: "detailed", workstations: new Map() });
    expect(frozen.attempts).toEqual([]);
  });
});

describe("DayTrackingLevelsReading — ce que la fiche sert, sans rien écrire", () => {
  it("le niveau figé l'emporte sur le réglage courant", async () => {
    const { freezing, reading, settings } = scene();
    await freezing.freezeIfDue(ServiceDay.of(DAY));
    settings.current = ProductionTrackingSettings.of({ level: "always_green", marginMinutes: 15 });

    const levels = await reading.levelsOf(ServiceDay.of(DAY), { closedAt: CLOSED_AT });

    expect(levels.house).toBe("simple");
  });

  it("une journée pas encore figée sert le réglage courant, et ne fige rien", async () => {
    const { reading, frozen } = scene();

    const levels = await reading.levelsOf(ServiceDay.of(DAY), { closedAt: CLOSED_AT });

    expect(levels.house).toBe("simple");
    expect(levels.workstations.get("ws-pastry")).toBe("detailed");
    expect(frozen.attempts).toEqual([]);
  });

  it("une journée d'avant la mise en service est en détaillé, sans lire les réglages", async () => {
    const { reading } = scene({ since: SINCE_AFTER });

    const levels = await reading.levelsOf(ServiceDay.of(DAY), { closedAt: CLOSED_AT });

    expect(levels).toEqual({ house: "detailed", workstations: new Map() });
  });

  it("personne n'a rien réglé : toujours vert", async () => {
    const { reading, settings, stations } = scene();
    settings.current = null;
    stations.stations = [];

    const levels = await reading.levelsOf(ServiceDay.of(DAY), { closedAt: null });

    expect(levels.house).toBe("always_green");
  });
});
