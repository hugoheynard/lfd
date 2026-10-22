import {
  FixedStaffAuthorDirectory,
  authorsKnownAs,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../../../channels/commerce/resupply-launched.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import {
  ResupplyAlreadyLaunchedError,
  ResupplyLaunchOnUnarrestedPlanError,
  ResupplyToLaunchNotFoundError,
} from "../../../domain/errors/resupply-launch-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryBatches, RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { DayResupplies } from "../../__tests__/settings-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
import { LaunchResupplyCommand } from "../launch-resupply.command.js";
import { LaunchResupplyHandler } from "../launch-resupply.handler.js";

/**
 * « Lancer » un réassort « au plus tôt » (R4a, `reassort-boutiques/plan-au-plus-tot.md`
 * §2) : sous le verrou de la journée, le réassort lu au commerce APRÈS le
 * verrou, l'agrégat qui décide, le journal et le fait. Instants recopiés,
 * jamais comparés à l'horloge — exception étroite du §5.
 */

const EVENING = new Date("2026-09-07T18:00:00.000Z");
const NOW = new Date("2026-09-08T07:30:00.000Z");
const DAY = "2026-09-08";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  clientele: null,
  siteId: null,
  sheetDetails: null,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
};

const ASAP: PlacedResupply = {
  resupplyId: "rs_asap",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: "Vitrine du midi",
  servedByTransfer: true,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 8 }],
};

class Commerce extends DayOrdersReader {
  constructor(
    private readonly rows: readonly ProducibleOrder[],
    private readonly trace: string[],
  ) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.trace.push("producibleFor");
    return Promise.resolve(this.rows);
  }
}

class Days extends ProductionDayRepository {
  saved: ProductionDay | null = null;

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

  save(day: ProductionDay): Promise<void> {
    this.trace.push("save");
    this.saved = day;
    return Promise.resolve();
  }
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Set<string>(), EVENING, null);
  return day;
}

function subject(day: ProductionDay, orders: readonly ProducibleOrder[] = [ORDER]) {
  const trace: string[] = [];
  const days = new Days(day, trace);
  const resupplies = new DayResupplies([], trace);
  resupplies.asap = [ASAP];
  const events = new RecordingPublisher();
  const durable = new RecordingDurable(trace);
  const handler = new LaunchResupplyHandler(
    days,
    new RecordingDayLock(trace),
    new DirectUnitOfWork(),
    new FixedClock(NOW),
    resupplies,
    new Commerce(orders, trace),
    new InMemoryWithdrawals(trace),
    new InMemoryBatches(),
    new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Max", lastName: "Martin" }, "s_max"),
    ),
    events,
    durable,
  );
  return { handler, days, resupplies, events, durable, trace };
}

const LAUNCH = new LaunchResupplyCommand(DAY, "rs_asap", "s_max");

describe("LaunchResupplyHandler", () => {
  it("lit le commerce, PUIS verrouille, recharge, lit LE réassort, écrit et publie", async () => {
    const { handler, trace } = subject(closedDay());

    await handler.execute(LAUNCH);

    expect(trace).toEqual([
      "producibleFor",
      `lock:${DAY}`,
      "load",
      `asap:${DAY}:rs_asap`,
      "save",
      `publish:${PRODUCTION_RESUPPLY_LAUNCHED}`,
    ]);
  });

  it("ajoute le réassort au plan et le compte, puis journalise", async () => {
    const { handler, days, events } = subject(closedDay());

    await handler.execute(LAUNCH);

    expect(days.saved?.launchedResupplies.map((r) => r.resupplyId)).toEqual(["rs_asap"]);
    expect(days.saved?.counts[0]?.quantity).toBe(48);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.resupply_launched",
        subjectType: "production_day",
        subjectId: DAY,
        payload: {
          subjectLabel: DAY,
          serviceDay: DAY,
          resupplyId: "rs_asap",
          resupplyName: "Vitrine du midi",
          siteLabel: "Le Village",
          openedPlan: false,
        },
      },
    ]);
  });

  it("publie le fait avec le réassort, l'instant et le nom de qui lance", async () => {
    const { handler, durable } = subject(closedDay());

    await handler.execute(LAUNCH);

    const fact = durable.facts[0];
    expect(fact?.key).toBe(`${PRODUCTION_RESUPPLY_LAUNCHED}:${DAY}:rs_asap`);
    const relu = ResupplyLaunchedEvent.fromPayload(fact?.payload ?? {});
    expect(relu).toMatchObject({
      serviceDay: DAY,
      launchedAt: NOW,
      launchedBy: "s_max",
      launchedByName: "Max Martin",
      resupply: ASAP,
    });
  });

  it("suffixe la clé du fait après une réouverture", async () => {
    const day = closedDay();
    day.reopen({ packingStarted: false, dispatchStarted: false }, EVENING, "s_max");
    day.close([ORDER], new Set<string>(), EVENING, null);
    const { handler, durable } = subject(day);

    await handler.execute(LAUNCH);

    expect(durable.facts[0]?.key).toBe(
      `${PRODUCTION_RESUPPLY_LAUNCHED}:${DAY}:rs_asap:after-reopening:${EVENING.toISOString()}`,
    );
  });

  it("refuse un réassort que le commerce ne rend plus (annulé), sans rien écrire", async () => {
    const { handler, days, resupplies, durable } = subject(closedDay());
    resupplies.asap = [];

    await expect(handler.execute(LAUNCH)).rejects.toThrow(ResupplyToLaunchNotFoundError);
    expect(days.saved).toBeNull();
    expect(durable.facts).toEqual([]);
  });

  it("refuse un second lancement", async () => {
    const day = closedDay();
    day.launchResupply(
      ASAP,
      { at: EVENING, staffUserId: "s_lou", name: null },
      {
        orders: [],
        withdrawn: new Set<string>(),
        resupplies: [],
      },
    );
    const { handler, durable } = subject(day);

    await expect(handler.execute(LAUNCH)).rejects.toThrow(ResupplyAlreadyLaunchedError);
    expect(durable.facts).toEqual([]);
  });
});

describe("LaunchResupplyHandler — journée jamais arrêtée (Q5)", () => {
  it("lit les retraits et le soir SOUS le verrou, puis ouvre la journée arrêtée", async () => {
    const { handler, days, events, trace } = subject(ProductionDay.open(ServiceDay.of(DAY)), []);

    await handler.execute(LAUNCH);

    expect(trace.slice(0, 6)).toEqual([
      "producibleFor",
      `lock:${DAY}`,
      "load",
      `asap:${DAY}:rs_asap`,
      `withdrawals:${DAY}`,
      `resupplies:${DAY}`,
    ]);
    expect(days.saved?.isClosed).toBe(true);
    expect(days.saved?.closedBy).toEqual({
      kind: "staff",
      staffUserId: "s_max",
      name: "Max Martin",
    });
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ openedPlan: true });
  });

  it("refuse si le commerce a encore des commandes à figer ce jour-là", async () => {
    const { handler, days } = subject(ProductionDay.open(ServiceDay.of(DAY)), [ORDER]);

    await expect(handler.execute(LAUNCH)).rejects.toThrow(ResupplyLaunchOnUnarrestedPlanError);
    expect(days.saved).toBeNull();
  });
});
