import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { ClosedPlansReader } from "../../../channels/commerce/closed-plans.reader.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { ProductionPlanAdmissionDesk } from "../production-plan-admission.desk.js";

/**
 * Le guichet d'admission (lot O3 de `plan-reglages-commandes.md`, §8.1, S5) :
 * verrou de la journée, PUIS lecture de l'arrêt — l'ordre qui ferme la course
 * entre une passation et l'arrêt du plan (O5).
 */

const DAY = ServiceDay.of("2026-10-15");

class TracedClosedPlans extends ClosedPlansReader {
  constructor(
    private readonly closed: readonly string[],
    private readonly trace: string[],
  ) {
    super();
  }

  closedBetween(from: string, to: string): Promise<readonly string[]> {
    this.trace.push(`read:${from}..${to}`);
    return Promise.resolve(this.closed.filter((day) => from <= day && day <= to));
  }
}

function subject(closed: readonly string[] = []) {
  const trace: string[] = [];
  const desk = new ProductionPlanAdmissionDesk(
    new RecordingDayLock(trace),
    new TracedClosedPlans(closed, trace),
    new DirectUnitOfWork(),
  );
  return { desk, trace };
}

describe("ProductionPlanAdmissionDesk", () => {
  it("verrouille la journée, PUIS lit son arrêt : ouverte", async () => {
    const { desk, trace } = subject();

    expect(await desk.admit(DAY)).toBe("open");
    expect(trace).toEqual([`lock:${DAY.value}`, `read:${DAY.value}..${DAY.value}`]);
  });

  it("une journée au plan arrêté est « closed »", async () => {
    const { desk } = subject([DAY.value]);

    expect(await desk.admit(DAY)).toBe("closed");
  });

  it("l'arrêt d'une AUTRE journée ne ferme pas celle-ci", async () => {
    const { desk } = subject(["2026-10-14", "2026-10-16"]);

    expect(await desk.admit(DAY)).toBe("open");
  });
});
