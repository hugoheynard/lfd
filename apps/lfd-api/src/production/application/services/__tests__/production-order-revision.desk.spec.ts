import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
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

function subject(inscribed: ReadonlyMap<string, string> = new Map()) {
  const trace: string[] = [];
  const notices = new InMemoryRevisionNotices();
  const desk = new ProductionOrderRevisionDesk(
    new RecordingDayLock(trace),
    new FixedInscriptions(inscribed, trace),
    new InMemoryRevisionNoticeLedger(notices, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  return { desk, trace, notices };
}

describe("ProductionOrderRevisionDesk", () => {
  it("verrouille les deux journées, la plus ancienne d'abord, PUIS l'inscription, PUIS les notes", async () => {
    const { desk, trace } = subject();

    const outcome = await desk.note([LATE, EARLY], "ord_1", 2);

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

    await desk.note([EARLY, EARLY], "ord_1", 1);

    expect(trace.filter((step) => step.startsWith("lock:"))).toEqual([`lock:${EARLY.value}`]);
    expect(trace.filter((step) => step.startsWith("note:"))).toHaveLength(1);
  });

  it("une commande déjà inscrite : « inscribed », et rien n'est noté", async () => {
    const { desk, notices } = subject(new Map([["ord_1", EARLY.value]]));

    const outcome = await desk.note([EARLY], "ord_1", 1);

    expect(outcome).toBe("inscribed");
    expect(notices.rows).toEqual([]);
  });

  it("la note fait bouger le repère de la journée, et de celle-là seule", async () => {
    const { desk, notices } = subject();
    const before = await notices.markerOf(LATE);

    await desk.note([EARLY], "ord_1", 1);

    expect(await notices.markerOf(EARLY)).not.toBeNull();
    expect(await notices.markerOf(LATE)).toBe(before);
  });
});
