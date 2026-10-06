import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../../channels/commerce/day-orders.reader.js";
import { PendingSettlementSweeper } from "../../../channels/commerce/pending-settlement.sweeper.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { CloseProductionDayCommand } from "../close-production-day.command.js";
import { CloseProductionDayHandler } from "../close-production-day.handler.js";

/**
 * Le verrou de la clôture (lot A0 du plan d'arrêt, B1, 2026-10-06) : la
 * décision « clore ou réannoncer » se prend sur la journée RELUE sous le
 * verrou, jamais sur la lecture qui le précède.
 */

const NOW = new Date("2026-09-07T18:00:00.000Z");
const EARLIER = new Date("2026-09-07T17:00:00.000Z");
const DAY = "2026-09-08";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 40 }],
};

/** Rend, appel après appel, les journées qu'on lui donne ; note chaque lecture. */
class SequencedDays extends ProductionDayRepository {
  saved: ProductionDay | null = null;

  constructor(
    private readonly sequence: ProductionDay[],
    private readonly trace: string[],
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    this.trace.push("load");
    const next = this.sequence.length > 1 ? this.sequence.shift() : this.sequence[0];
    if (next === undefined) {
      return Promise.reject(new Error("aucune journée à rendre"));
    }
    return Promise.resolve(next);
  }

  save(day: ProductionDay): Promise<void> {
    this.trace.push("save");
    this.saved = day;
    return Promise.resolve();
  }
}

class Commerce extends DayOrdersReader {
  constructor(private readonly trace: string[]) {
    super();
  }

  producibleFor(): Promise<readonly ProducibleOrder[]> {
    this.trace.push("producibleFor");
    return Promise.resolve([ORDER]);
  }
}

class Sweeper extends PendingSettlementSweeper {
  sweep(): Promise<void> {
    return Promise.resolve();
  }
}

class Durable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

function open(): ProductionDay {
  return ProductionDay.open(ServiceDay.of(DAY));
}

function closed(): ProductionDay {
  const day = open();
  day.close([ORDER], EARLIER);
  return day;
}

function subject(sequence: ProductionDay[]) {
  const trace: string[] = [];
  const days = new SequencedDays(sequence, trace);
  const events = new RecordingPublisher();
  const durable = new Durable();
  const handler = new CloseProductionDayHandler(
    days,
    new Commerce(trace),
    new Sweeper(),
    events,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    durable,
    new RecordingDayLock(trace),
  );
  return { handler, days, events, durable, trace };
}

describe("clore sous le verrou de la journée", () => {
  it("lit le commerce, PUIS verrouille, PUIS recharge, PUIS écrit", async () => {
    const { handler, trace } = subject([open(), open()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(trace).toEqual(["load", "producibleFor", `lock:${DAY}`, "load", "save"]);
  });

  /**
   * Régression : la journée était chargée hors verrou, et deux clôtures
   * concurrentes fermaient toutes les deux (constaté le 2026-10-06).
   */
  it("une journée trouvée CLOSE sous le verrou réannonce, même lue ouverte avant", async () => {
    const { handler, days, events, durable } = subject([open(), closed()]);

    const closure = await handler.execute(new CloseProductionDayCommand(DAY));

    expect(closure).toMatchObject({ alreadyClosed: true, closedAt: EARLIER.toISOString() });
    expect(days.saved).toBeNull();
    expect(events.traced).toEqual([]);
    expect(durable.facts[0]?.key).toBe(
      `production.day_closed:${DAY}:${EARLIER.toISOString()}:reannounced:${NOW.toISOString()}`,
    );
  });

  it("une journée déjà close hors verrou réannonce elle aussi sous le verrou", async () => {
    const { handler, trace } = subject([closed()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(trace).toEqual(["load", `lock:${DAY}`, "load"]);
  });
});
