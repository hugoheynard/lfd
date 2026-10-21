import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../channels/commerce/production-day-reopened.event.js";
import { DayDispatchProgressReader } from "../../../channels/delivery/day-dispatch-progress.reader.js";
import { DayPackingProgressReader } from "../../../channels/packing/day-packing-progress.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayNotClosedError } from "../../../domain/errors/production-errors.js";
import {
  ReopenAfterDispatchError,
  ReopenAfterPackingError,
} from "../../../domain/errors/reopening-errors.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { ReopenProductionDayCommand } from "../reopen-production-day.command.js";
import { ReopenProductionDayHandler } from "../reopen-production-day.handler.js";

/** Deux instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const NOW = new Date("2026-10-14T19:00:00.000Z");
const DAY = "2026-10-15";

function order(orderId: string): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "delivery",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity: 8 }],
  };
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

/** Le colisage doublé : il répond, et dit QUAND on l'a interrogé. */
class Packing extends DayPackingProgressReader {
  constructor(
    private readonly started: boolean,
    private readonly trace: string[],
  ) {
    super();
  }

  startedOn(serviceDay: string): Promise<boolean> {
    this.trace.push(`packing:${serviceDay}`);
    return Promise.resolve(this.started);
  }
}

class Dispatch extends DayDispatchProgressReader {
  constructor(
    private readonly started: boolean,
    private readonly trace: string[],
  ) {
    super();
  }

  startedOn(serviceDay: string): Promise<boolean> {
    this.trace.push(`dispatch:${serviceDay}`);
    return Promise.resolve(this.started);
  }
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1"), order("ord_2")], new Set<string>(), CLOSED, null);
  return day;
}

function setup(day: ProductionDay, progress = { packing: false, dispatch: false }) {
  const trace: string[] = [];
  const days = new Days(day, trace);
  const events = new RecordingPublisher();
  const durable = new RecordingDurable(trace);
  const handler = new ReopenProductionDayHandler(
    days,
    new RecordingDayLock(trace),
    new Packing(progress.packing, trace),
    new Dispatch(progress.dispatch, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    events,
    durable,
  );
  return { handler, days, events, durable, trace };
}

describe("ReopenProductionDayHandler", () => {
  it("questionne l'aval AVANT le verrou, puis rouvre la journée relue sous lui", async () => {
    const { handler, trace } = setup(closedDay());

    await handler.execute(new ReopenProductionDayCommand(DAY, "staff-1"));

    expect(trace).toEqual([
      `packing:${DAY}`,
      `dispatch:${DAY}`,
      `lock:${DAY}`,
      "load",
      "save",
      `publish:${PRODUCTION_DAY_REOPENED}`,
    ]);
  });

  it("écrit la journée rouverte, journalise son auteur et publie le plan défait", async () => {
    const { handler, days, events, durable } = setup(closedDay());

    const reopening = await handler.execute(new ReopenProductionDayCommand(DAY, "staff-1"));

    expect(reopening).toEqual({ date: DAY, released: 2, reopenedAt: NOW.toISOString() });
    expect(days.saved?.isClosed).toBe(false);
    expect(days.saved?.reopened).toEqual({ at: NOW, by: "staff-1" });
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "production_day.reopened",
        subjectType: "production_day",
        subjectId: DAY,
        payload: { subjectLabel: DAY, serviceDay: DAY, absorbed: 2 },
      },
    ]);
    const [fact] = durable.of(PRODUCTION_DAY_REOPENED);
    expect(fact?.key).toBe(`${PRODUCTION_DAY_REOPENED}:${DAY}:${NOW.toISOString()}`);
    expect(ProductionDayReopenedEvent.fromPayload(fact?.payload ?? {})).toEqual(
      new ProductionDayReopenedEvent(DAY, NOW, CLOSED, ["ord_1", "ord_2"]),
    );
  });

  /** Lot R3a : la réouverture dégèle aussi les réassorts, et le fait les nomme. */
  it("dégèle les réassorts figés et les nomme dans le fait", async () => {
    const day = ProductionDay.open(ServiceDay.of(DAY));
    day.close([order("ord_1")], new Set<string>(), CLOSED, null, [
      {
        resupplyId: "rs_1",
        siteId: "site_village",
        siteLabel: "Le Village",
        servedByTransfer: true,
        lines: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity: 3 }],
      },
    ]);
    const { handler, days, durable } = setup(day);

    const reopening = await handler.execute(new ReopenProductionDayCommand(DAY, "staff-1"));

    expect(reopening.released).toBe(1);
    expect(days.saved?.resupplies).toEqual([]);
    const [fact] = durable.of(PRODUCTION_DAY_REOPENED);
    expect(ProductionDayReopenedEvent.fromPayload(fact?.payload ?? {}).resupplyIds).toEqual([
      "rs_1",
    ]);
  });

  it("refuse quand le colisage a commencé, sans rien écrire ni publier", async () => {
    const { handler, days, events, durable } = setup(closedDay(), {
      packing: true,
      dispatch: false,
    });

    await expect(
      handler.execute(new ReopenProductionDayCommand(DAY, "staff-1")),
    ).rejects.toBeInstanceOf(ReopenAfterPackingError);
    expect(days.saved).toBeNull();
    expect(events.traced).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse quand une tournée est chargée ou partie", async () => {
    const { handler } = setup(closedDay(), { packing: false, dispatch: true });

    await expect(
      handler.execute(new ReopenProductionDayCommand(DAY, "staff-1")),
    ).rejects.toBeInstanceOf(ReopenAfterDispatchError);
  });

  it("refuse une journée ouverte", async () => {
    const { handler } = setup(ProductionDay.open(ServiceDay.of(DAY)));

    await expect(
      handler.execute(new ReopenProductionDayCommand(DAY, "staff-1")),
    ).rejects.toBeInstanceOf(ProductionDayNotClosedError);
  });
});
