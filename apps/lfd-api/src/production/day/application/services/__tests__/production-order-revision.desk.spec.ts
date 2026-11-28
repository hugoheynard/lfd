import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { RevisedOrderInscribedElsewhereError } from "../../../domain/errors/order-revision-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import {
  InMemoryRevisionNoticeLedger,
  InMemoryRevisionNotices,
} from "../../__tests__/revision-notice-doubles.js";
import { FixedInscriptions } from "../../../../channels/commerce/__tests__/order-inscription-doubles.js";
import type { DeskActor } from "../../../../channels/commerce/desk-actor.js";
import { ProductionOrderRevisionDesk } from "../production-order-revision.desk.js";
import { PlanVersionStore, planVersionRecorder } from "./plan-version-doubles.js";

/**
 * Le guichet de la révision (voir `documentation/commandes/modification/modifier-une-commande.md`,
 * § 2.8 « Les autres blocs ») : les journées verrouillées par date croissante, PUIS l'inscription,
 * PUIS les notes — l'ordre qui ferme la course avec la clôture.
 */

/** Recopié dans la note, jamais comparé à l'horloge — exception étroite du §5. */
const NOW = new Date("2026-10-23T15:00:00.000Z");
const EARLY = ServiceDay.of("2026-10-24");
const LATE = ServiceDay.of("2026-10-25");

const STAFF: DeskActor = { kind: "staff", staffId: "staff-1" };
const LINES = [{ sku: "BAG", quantity: 10, options: [] }];

function subject(
  inscribed: ReadonlyMap<string, string> = new Map(),
  plan: ProductionDay = ProductionDay.open(EARLY),
) {
  const trace: string[] = [];
  const notices = new InMemoryRevisionNotices();
  const days = new SavedDays(plan, trace);
  const events = new RecordingPublisher();
  const durable = new RecordingDurable(trace);
  const versions = new PlanVersionStore();
  const desk = new ProductionOrderRevisionDesk(
    new RecordingDayLock(trace),
    new FixedInscriptions(inscribed, trace),
    new InMemoryRevisionNoticeLedger(notices, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    days,
    events,
    durable,
    planVersionRecorder(days, versions),
  );
  return { desk, trace, notices, days, events, durable, versions };
}

describe("ProductionOrderRevisionDesk", () => {
  it("verrouille les deux journées, la plus ancienne d'abord, PUIS l'inscription, PUIS les notes", async () => {
    const { desk, trace } = subject();

    const outcome = await desk.note([LATE, EARLY], "ord_1", 2, LINES, "before_inscription", STAFF);

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

    await desk.note([EARLY, EARLY], "ord_1", 1, LINES, "before_inscription", STAFF);

    expect(trace.filter((step) => step.startsWith("lock:"))).toEqual([`lock:${EARLY.value}`]);
    expect(trace.filter((step) => step.startsWith("note:"))).toHaveLength(1);
  });

  it("une commande déjà inscrite : « inscribed », et rien n'est noté", async () => {
    const { desk, notices } = subject(new Map([["ord_1", EARLY.value]]));

    const outcome = await desk.note([EARLY], "ord_1", 1, LINES, "before_inscription", STAFF);

    expect(outcome).toBe("inscribed");
    expect(notices.rows).toEqual([]);
  });

  it("la note fait bouger le repère de la journée, et de celle-là seule", async () => {
    const { desk, notices } = subject();
    const before = await notices.markerOf(LATE);

    await desk.note([EARLY], "ord_1", 1, LINES, "before_inscription", STAFF);

    expect(await notices.markerOf(EARLY)).not.toBeNull();
    expect(await notices.markerOf(LATE)).toBe(before);
  });
});

/** Une journée arrêtée avec une commande `ord_1` de 10 baguettes. */
function closedPlan(): ProductionDay {
  const open = ProductionDay.open(EARLY);
  open.close(
    [
      producibleOrder("ord_1", {
        reference: "ORD-0001",
        clientele: "pro",
        lines: [orderLine("BAG", 10, "Baguette")],
      }),
    ],
    new Set<string>(),
    NOW,
    null,
  );
  return ProductionDay.fromSnapshot(open.toSnapshot());
}

const INSCRIBED = new Map([["ord_1", EARLY.value]]);

describe("ProductionOrderRevisionDesk — plan A2, `staff_quantities`", () => {
  it("une hausse : verrou, inscription, journée relue, dû et compte montés, puis le fait", async () => {
    const { desk, trace, days, events, durable, notices } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 12, options: [] }],
      "staff_quantities",
      STAFF,
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
      [{ sku: "BAG", quantity: 4, options: [] }],
      "staff_quantities",
      STAFF,
    );

    expect(outcome).toBe("unchanged");
    expect(days.day.orders[0]?.lines[0]?.quantity).toBe(4);
    expect(days.day.counts[0]?.quantity).toBe(10);
    expect(events.factTypes()).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("deux journées (la date change) : « inscribed », rien n'est relu ni écrit", async () => {
    const { desk, days } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note([EARLY, LATE], "ord_1", 3, LINES, "staff_quantities", STAFF);

    expect(outcome).toBe("inscribed");
    expect(days.saved).toBe(0);
  });

  /**
   * Régression (audit final du réassort, 2026-11-03) : le jour d'inscription
   * n'était pas comparé au jour révisé. Inscrite le 25, révisée « le 24 »,
   * la commande était cherchée au plan du 24, où elle n'est pas.
   */
  it("une commande inscrite un autre jour que celui qu'on révise est refusée en nommant les deux jours", async () => {
    const { desk, days, durable } = subject(new Map([["ord_1", LATE.value]]), closedPlan());

    const revising = desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 12, options: [] }],
      "staff_quantities",
      STAFF,
    );

    await expect(revising).rejects.toThrow(RevisedOrderInscribedElsewhereError);
    await expect(revising).rejects.toThrow(
      `inscrite au plan du ${LATE.value}, pas à celui du ${EARLY.value}`,
    );
    expect(days.saved).toBe(0);
    expect(durable.facts).toEqual([]);
  });

  it("sous `before_inscription`, une commande inscrite reste refusée", async () => {
    const { desk, days } = subject(INSCRIBED, closedPlan());

    const outcome = await desk.note(
      [EARLY],
      "ord_1",
      3,
      [{ sku: "BAG", quantity: 12, options: [] }],
      "before_inscription",
      STAFF,
    );

    expect(outcome).toBe("inscribed");
    expect(days.saved).toBe(0);
  });

  it("une commande pas encore inscrite est seulement notée, même sous `staff_quantities`", async () => {
    const { desk, days, notices } = subject(new Map(), closedPlan());

    const outcome = await desk.note([EARLY], "ord_1", 3, LINES, "staff_quantities", STAFF);

    expect(outcome).toBe("noted");
    expect(notices.rows).toHaveLength(1);
    expect(days.saved).toBe(0);
  });

  describe("la version du plan (les-versions-du-plan)", () => {
    it("une hausse : la journée garde une version `order_revised`, signée du staff", async () => {
      const { desk, days, versions } = subject(INSCRIBED, closedPlan());

      await desk.note(
        [EARLY],
        "ord_1",
        3,
        [{ sku: "BAG", quantity: 12, options: [] }],
        "staff_quantities",
        STAFF,
      );

      expect(versions.appended.map((version) => version.cause)).toEqual(["order_revised"]);
      expect(versions.appended[0]?.toRecord().recordedBy).toEqual({
        kind: "staff",
        staffId: "staff-1",
        name: null,
      });
      expect(days.day.planVersion).toBe(1);
    });

    it("une révision qui ne change rien au plan (mêmes quantités) : « unchanged », aucune version de plus", async () => {
      const { desk, versions } = subject(INSCRIBED, closedPlan());
      const twelve = [{ sku: "BAG", quantity: 12, options: [] }];
      await desk.note([EARLY], "ord_1", 3, twelve, "staff_quantities", STAFF);

      const outcome = await desk.note([EARLY], "ord_1", 4, twelve, "staff_quantities", STAFF);

      expect(outcome).toBe("unchanged");
      expect(versions.appended.map((version) => version.version)).toEqual([1]);
    });

    it("une révision notée avant l'inscription ne touche pas le plan : aucune version", async () => {
      const { desk, versions } = subject();

      await desk.note([EARLY], "ord_1", 1, LINES, "before_inscription", STAFF);

      expect(versions.appended).toEqual([]);
    });
  });
});
