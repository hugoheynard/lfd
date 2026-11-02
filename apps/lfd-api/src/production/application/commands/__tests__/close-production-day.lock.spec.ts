import { FixedStaffAuthorDirectory } from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
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
import { ProductionDayStatusReader } from "../../../domain/ports/production-day-status.reader.js";
import { intakeReadingOf } from "../../__tests__/plan-intake-doubles.js";
import { DayResupplies, stopRulesOf } from "../../__tests__/settings-doubles.js";
import { PlanArrestRecording } from "../../services/plan-arrest-recording.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";
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
  reference: "ORD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  clientele: null,
  siteId: null,
  sheetDetails: null,
  lines: [
    {
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 40,
      saleUnit: "piece",
      madeToOrder: null,
    },
  ],
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
  day.close([ORDER], new Set<string>(), EARLIER, null);
  return day;
}

function subject(sequence: ProductionDay[], status?: ProductionDayStatusReader) {
  const trace: string[] = [];
  const days = new SequencedDays(sequence, trace);
  const events = new RecordingPublisher();
  const durable = new Durable();
  const reading = intakeReadingOf({
    days,
    orders: new Commerce(trace),
    withdrawals: new InMemoryWithdrawals(trace),
    resupplies: new DayResupplies([], trace),
    ...(status === undefined ? {} : { status }),
  });
  const handler = new CloseProductionDayHandler(
    reading,
    new PlanArrestRecording(days, durable),
    new Sweeper(),
    stopRulesOf(),
    new FixedStaffAuthorDirectory(),
    events,
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    new RecordingDayLock(trace),
  );
  return { handler, days, events, durable, trace };
}

/** L'en-tête seul : il note qu'on l'a lu, et dit « ouverte ». */
class HeaderOnly extends ProductionDayStatusReader {
  constructor(private readonly trace: string[]) {
    super();
  }

  isClosed(): Promise<boolean> {
    this.trace.push("status");
    return Promise.resolve(false);
  }
}

describe("clore sous le verrou de la journée", () => {
  /**
   * Régression : les commandes étaient lues AVANT le verrou ; une commande
   * NOUVELLE admise entre la lecture et le verrou (la passation prend le même
   * verrou par le guichet d'admission) n'était pas figée, et la journée
   * s'arrêtait sans elle (constaté le 2026-11-02, même trou que G-A).
   */
  it("verrouille, PUIS recharge, PUIS lit les commandes, PUIS écrit", async () => {
    const { handler, trace } = subject([open(), open()]);

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(trace).toEqual([
      "load",
      `lock:${DAY}`,
      "load",
      // Les retraits de l'annulation staff, SOUS le verrou (C3.4).
      `withdrawals:${DAY}`,
      // Les réassorts pour demain, SOUS le verrou (lot R3a).
      `resupplies:${DAY}`,
      "producibleFor",
      "save",
    ]);
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

  /**
   * Régression (audit du réassort, 2026-11-02) : la lecture hors verrou
   * relisait la journée ENTIÈRE — commandes, lignes, compte, fournées — pour
   * n'en garder que `closedAt`. Elle ne lit plus que l'en-tête.
   */
  it("hors verrou, ne lit que l'en-tête ; la journée entière n'est relue que sous lui", async () => {
    const trace: string[] = [];
    const { handler, trace: steps } = subject([open()], new HeaderOnly(trace));

    await handler.execute(new CloseProductionDayCommand(DAY));

    expect(trace).toEqual(["status"]);
    expect(steps.slice(0, 2)).toEqual([`lock:${DAY}`, "load"]);
  });
});
