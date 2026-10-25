import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryBatches, RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import {
  InMemoryRevisionNoticeLedger,
  InMemoryRevisionNotices,
} from "../../__tests__/revision-notice-doubles.js";
import { FixedInscriptions } from "../../__tests__/withdrawal-doubles.js";
import { ProductionOrderRevisionDesk } from "../production-order-revision.desk.js";

/**
 * Le guichet de la révision (plan `documentation/commandes/modification/plan-modifier-une-commande.md`,
 * §9.1) : les journées verrouillées par date croissante, PUIS l'inscription,
 * PUIS les notes — l'ordre qui ferme la course avec la clôture.
 */

/** Recopié dans la note, jamais comparé à l'horloge — exception étroite du §5. */
const NOW = new Date("2026-10-23T15:00:00.000Z");
const EARLY = ServiceDay.of("2026-10-24");
const LATE = ServiceDay.of("2026-10-25");

const LINES = [{ sku: "BAG", quantity: 10 }];

function subject(
  inscribed: ReadonlyMap<string, string> = new Map(),
  plan: ProductionDay = ProductionDay.open(EARLY),
) {
  const trace: string[] = [];
  const notices = new InMemoryRevisionNotices();
  const days = new SavedDays(plan, trace);
  const batches = new InMemoryBatches(trace);
  const events = new RecordingPublisher();
  const durable = new RecordingDurable(trace);
  const desk = new ProductionOrderRevisionDesk(
    new RecordingDayLock(trace),
    new FixedInscriptions(inscribed, trace),
    new InMemoryRevisionNoticeLedger(notices, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    days,
    batches,
    events,
    durable,
  );
  return { desk, trace, notices, days, batches, events, durable };
}

describe("ProductionOrderRevisionDesk", () => {
  it("verrouille les deux journées, la plus ancienne d'abord, PUIS l'inscription, PUIS les notes", async () => {
    const { desk, trace } = subject();

    const outcome = await desk.note([LATE, EARLY], "ord_1", 2, LINES, "before_inscription");

    expect(outcome).toBe("noted");
    expect(trace).toEqual([
      `lock:${EARLY.value}`,
      `lock:${LATE.value}`,
      "inscription:ord_1",
      `note:${EARLY.value}:ord_1:r2`,
      `note:${LATE.value}:ord_1:r2`,
    ]);
  });

  it("une même journée citée deux fois ne se verrouille et ne se note qu'une fois", async () => {
    const { desk, trace } = subject();

    await desk.note([EARLY, EARLY], "ord_1", 1, LINES, "before_inscription");

    expect(trace.filter((step) => step.startsWith("lock:"))).toEqual([`lock:${EARLY.value}`]);
    expect(trace.filter((step) => step.startsWith("note:"))).toHaveLength(1);
  });

  it("une commande déjà inscrite : « inscribed », et rien n'est noté", async () => {
    const { desk, notices } = subject(new Map([["ord_1", EARLY.value]]));

    const outcome = await desk.note([EARLY], "ord_1", 1, LINES, "before_inscription");

    expect(outcome).toBe("inscribed");
    expect(notices.rows).toEqual([]);
  });

  it("la note fait bouger le repère de la journée, et de celle-là seule", async () => {
    const { desk, notices } = subject();
    const before = await notices.markerOf(LATE);

    await desk.note([EARLY], "ord_1", 1, LINES, "before_inscription");

    expect(await notices.markerOf(EARLY)).not.toBeNull();
    expect(await notices.markerOf(LATE)).toBe(before);
  });
});

/** Une journée arrêtée avec une commande `ord_1` de 10 baguettes ; une coche héritée si `marked`. */
function closedPlan(marked = false): ProductionDay {
  const open = ProductionDay.open(EARLY);
  open.close(
    [
      {
        orderId: "ord_1",
        reference: "ORD-0001",
        customerLabel: "Hôtel des Trois Ponts",
        fulfillmentMethod: "pickup",
        destination: "Le Labo",
        dueAt: null,
        clientele: "pro",
        siteId: null,
        sheetDetails: null,
        lines: [{ sku: "BAG", productName: "Baguette", quantity: 10 }],
      },
    ],
    new Set<string>(),
    NOW,
    null,
  );
  const snapshot = open.toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    counts: snapshot.counts.map((item) =>
      marked ? { ...item, done: { at: NOW, by: "staff_four", initials: "" } } : item,
    ),
  });
}

const INSCRIBED = new Map([["ord_1", EARLY.value]]);

describe("ProductionOrderRevisionDesk — plan A2, `staff_quantities`", () => {
  it("une hausse : verrou, inscription, journée relue, dû et compte montés, puis le fait", async () => {
    const { desk, trace, days, events, durable, notices } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 12 }],
      "staff_quantities",
    );

    expect(outcome).toBe("raised");
    expect(trace.slice(0, 3)).toEqual([`lock:${EARLY.value}`, "inscription:ord_1", "load"]);
    expect(days.day.orders[0]?.lines[0]?.quantity).toBe(12);
    expect(days.day.counts[0]?.quantity).toBe(12);
    expect(events.factTypes()).toEqual(["production_day.order_quantities_raised"]);
    const [fact] = durable.of("production.order_quantities_raised");
    expect(fact?.key).toBe(`production.order_quantities_raised:${EARLY.value}:ord_1:r3`);
    expect(fact?.payload).toMatchObject({
      lines: [{ sku: "BAG", productName: "Baguette", from: 10, to: 12 }],
    });
    expect(notices.rows).toEqual([]);
  });

  /** Régression gardée (plan A2, § 7, B3) : une baisse ne fait pas baisser le compte du four. */
  it("une baisse : « unchanged », la ligne dit le dû, le compte du four ne baisse pas, aucun fait", async () => {
    const { desk, days, events, durable } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 4 }],
      "staff_quantities",
    );

    expect(outcome).toBe("unchanged");
    expect(days.day.orders[0]?.lines[0]?.quantity).toBe(4);
    expect(days.day.counts[0]?.quantity).toBe(10);
    expect(events.factTypes()).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("matérialise d'abord les coches héritées, et les écrit en fournées", async () => {
    const { desk, days, batches } = subject(INSCRIBED, closedPlan(true));

    await desk.note([EARLY], "ord_1", 3, [{ sku: "BAG", quantity: 12 }], "staff_quantities");

    expect(batches.batches.map((batch) => [batch.sku, batch.quantity])).toEqual([["BAG", 10]]);
    expect(days.day.counts[0]?.done).toBeNull();
  });

  it("deux journées (la date change) : « inscribed », rien n'est relu ni écrit", async () => {
    const { desk, days } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note([EARLY, LATE], "ord_1", 3, LINES, "staff_quantities");

    expect(outcome).toBe("inscribed");
    expect(days.saved).toBe(0);
  });

  it("sous `before_inscription`, une commande inscrite reste refusée", async () => {
    const { desk, days } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 12 }],
      "before_inscription",
    );

    expect(outcome).toBe("inscribed");
    expect(days.saved).toBe(0);
  });

  it("une commande pas encore inscrite est seulement notée, même sous `staff_quantities`", async () => {
    const { desk, days, notices } = subject(new Map(), closedPlan());

    const outcome = await desk.note([EARLY], "ord_1", 3, LINES, "staff_quantities");

    expect(outcome).toBe("noted");
    expect(notices.rows).toHaveLength(1);
    expect(days.saved).toBe(0);
  });
});
