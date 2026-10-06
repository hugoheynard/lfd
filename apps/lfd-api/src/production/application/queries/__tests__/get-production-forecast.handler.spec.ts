import { localToInstant } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ExpectedDayProduction } from "../../../channels/commerce/expected-production.reader.js";
import { ExpectedProductionReader } from "../../../channels/commerce/expected-production.reader.js";
import {
  AutoCloseAttemptLog,
  type DatedAttemptTrace,
} from "../../../domain/ports/auto-close-attempt-log.js";
import { ProductionCloseSettings } from "../../../domain/entities/production-close-settings.js";
import { ProductionPlanReader } from "../../../domain/ports/production-plan.reader.js";
import type { DayDemand } from "../../../domain/services/production-forecast.js";
import type { ServiceRange } from "../../../domain/value-objects/service-range.value-object.js";
import { GetProductionForecastHandler } from "../get-production-forecast.handler.js";
import { GetProductionForecastQuery } from "../get-production-forecast.query.js";
import {
  ClosedDaysTable,
  SettingsReader,
  SettingsTable,
} from "../../__tests__/settings-doubles.js";

/** L'instant de la maison `time` le jour `day` — les dates sont le SUJET, l'horloge est fixée. */
function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure locale inexistante : ${day} ${time}`);
  }
  return instant;
}

/** La trace des tentatives, doublée : posée par le test, filtrée sur la plage. */
class AttemptLog extends AutoCloseAttemptLog {
  constructor(readonly rows: DatedAttemptTrace[] = []) {
    super();
  }

  between(range: ServiceRange): Promise<readonly DatedAttemptTrace[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.day >= range.from.value && row.day <= range.to.value),
    );
  }
}

interface World {
  readonly clock: FixedClock;
  readonly settings: SettingsTable;
  readonly closedDays: ClosedDaysTable;
  readonly attempts: AttemptLog;
}

function world(now: Date = at("2026-09-03", "10:00")): World {
  return {
    clock: new FixedClock(now),
    settings: new SettingsTable(),
    closedDays: new ClosedDaysTable(),
    attempts: new AttemptLog(),
  };
}

function handlerOf(
  plan: ProductionPlanReader,
  expected: ExpectedProductionReader,
  w: World = world(),
): GetProductionForecastHandler {
  return new GetProductionForecastHandler(
    plan,
    expected,
    w.clock,
    new SettingsReader(w.settings, w.closedDays),
    w.attempts,
  );
}

/** Le plan arrêté, doublé : il retient la plage qu'on lui a demandée. */
class PlanStub extends ProductionPlanReader {
  asked: ServiceRange | null = null;

  constructor(private readonly days: readonly DayDemand[]) {
    super();
  }

  arrestedBetween(range: ServiceRange): Promise<readonly DayDemand[]> {
    this.asked = range;
    return Promise.resolve(this.days);
  }
}

/** Le commerce, doublé. Même mémoire de la plage reçue. */
class ExpectedStub extends ExpectedProductionReader {
  asked: ServiceRange | null = null;

  constructor(private readonly days: readonly ExpectedDayProduction[]) {
    super();
  }

  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]> {
    this.asked = range;
    return Promise.resolve(this.days);
  }
}

describe("GetProductionForecastHandler", () => {
  it("sert la matrice de la plage demandée, les deux sources arbitrées", async () => {
    const plan = new PlanStub([
      {
        day: "2026-09-03",
        items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 186 }],
        orderCount: 12,
      },
    ]);
    const expected = new ExpectedStub([
      {
        day: "2026-09-05",
        items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 410 }],
        orderCount: 47,
      },
    ]);

    const view = await handlerOf(plan, expected).execute(
      new GetProductionForecastQuery("2026-09-03", "2026-09-05"),
    );

    expect(view.days).toEqual([
      { date: "2026-09-03", totalUnits: 186, orderCount: 12, closed: true, state: "closed" },
      { date: "2026-09-04", totalUnits: 0, orderCount: 0, closed: false, state: "open" },
      { date: "2026-09-05", totalUnits: 410, orderCount: 47, closed: false, state: "open" },
    ]);
    expect(view.lines).toEqual([
      { sku: "PAI-BAG", productName: "Baguette", quantities: [186, 0, 410], totalUnits: 596 },
    ]);
    expect(view.peakDate).toBe("2026-09-05");
    expect(view.totalUnits).toBe(596);
  });

  it("interroge les DEUX sources sur la même plage", async () => {
    const plan = new PlanStub([]);
    const expected = new ExpectedStub([]);

    await handlerOf(plan, expected).execute(
      new GetProductionForecastQuery("2026-09-03", "2026-09-09"),
    );

    expect(plan.asked?.days).toHaveLength(7);
    expect(expected.asked?.from.value).toBe("2026-09-03");
    expect(expected.asked?.to.value).toBe("2026-09-09");
  });

  it("refuse une plage à l'envers — le refus vient du domaine, pas de la route", async () => {
    const handler = handlerOf(new PlanStub([]), new ExpectedStub([]));
    await expect(
      handler.execute(new GetProductionForecastQuery("2026-09-09", "2026-09-03")),
    ).rejects.toThrow(/précède/u);
  });

  describe("l'état de chaque journée, à l'heure de la maison (A3)", () => {
    const demand = (day: string, orderCount: number): ExpectedDayProduction => ({
      day,
      items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 10 }],
      orderCount,
    });

    async function states(w: World, plan: PlanStub, expected: ExpectedStub): Promise<string[]> {
      const view = await handlerOf(plan, expected, w).execute(
        new GetProductionForecastQuery("2026-09-02", "2026-09-06"),
      );
      return view.days.map((day) => `${day.date}:${day.state}`);
    }

    it("passée, arrêtée, en retard (demain passé l'alerte), fermée, ouverte", async () => {
      const w = world(at("2026-09-03", "20:05"));
      w.closedDays.days.set("2026-09-05", "fiche_1");
      const plan = new PlanStub([
        { day: "2026-09-02", items: [], orderCount: 1 },
        { day: "2026-09-03", items: [], orderCount: 4 },
      ]);
      const expected = new ExpectedStub([demand("2026-09-04", 2), demand("2026-09-06", 5)]);

      expect(await states(w, plan, expected)).toEqual([
        "2026-09-02:past",
        "2026-09-03:closed",
        "2026-09-04:overdue",
        "2026-09-05:closedDay",
        "2026-09-06:open",
      ]);
    });

    it("lit le réglage : en automatique, demain n'est en retard qu'à l'heure d'arrêt", async () => {
      const w = world(at("2026-09-03", "20:05"));
      const row = ProductionCloseSettings.initial();
      row.change({ mode: "auto", closeAt: "21:00", alertAt: null }, null, "fiche_1", w.clock.now());
      w.settings.row = row;
      const expected = new ExpectedStub([demand("2026-09-04", 2)]);

      expect(await states(w, new PlanStub([]), expected)).toContain("2026-09-04:open");
      w.clock.set(at("2026-09-03", "21:00"));
      expect(await states(w, new PlanStub([]), expected)).toContain("2026-09-04:overdue");
    });

    it("une tentative automatique en suspens depuis plus de quinze minutes met la journée en retard", async () => {
      const w = world(at("2026-09-03", "21:20"));
      w.attempts.rows.push({
        day: "2026-09-06",
        outcome: "pending",
        attemptedAt: at("2026-09-03", "21:00"),
      });

      expect(await states(w, new PlanStub([]), new ExpectedStub([]))).toContain(
        "2026-09-06:overdue",
      );
    });
  });
});
