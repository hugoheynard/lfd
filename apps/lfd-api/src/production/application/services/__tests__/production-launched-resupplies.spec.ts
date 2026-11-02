import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { LaunchedResupplyLookup } from "../../../domain/ports/launched-resupply.lookup.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { ProductionLaunchedResupplies } from "../production-launched-resupplies.js";

/**
 * Le refus synchrone d'annuler un réassort lancé : le fournil répond sous le
 * MÊME verrou que le lancement — verrou d'abord, lecture ensuite. Depuis le
 * 2026-11-02, la lecture vise le seul réassort, plus la journée entière.
 */

const DAY = "2026-09-08";

/** Les réassorts lancés, par (jour, réassort) ; chaque lecture est tracée. */
class Launched extends LaunchedResupplyLookup {
  constructor(
    private readonly launched: ReadonlySet<string>,
    private readonly trace: string[],
  ) {
    super();
  }

  isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean> {
    this.trace.push(`isLaunched:${day.value}:${resupplyId}`);
    return Promise.resolve(this.launched.has(resupplyId));
  }
}

describe("ProductionLaunchedResupplies", () => {
  it("verrouille la journée PUIS lit le réassort, et dit le lancé", async () => {
    const trace: string[] = [];
    const port = new ProductionLaunchedResupplies(
      new RecordingDayLock(trace),
      new Launched(new Set(["rs_asap"]), trace),
      new DirectUnitOfWork(),
    );

    expect(await port.isLaunched(ServiceDay.of(DAY), "rs_asap")).toBe(true);
    expect(trace).toEqual([`lock:${DAY}`, `isLaunched:${DAY}:rs_asap`]);
  });

  it("un réassort que le fournil n'a pas lancé ne l'est pas", async () => {
    const port = new ProductionLaunchedResupplies(
      new RecordingDayLock(),
      new Launched(new Set(["rs_asap"]), []),
      new DirectUnitOfWork(),
    );

    expect(await port.isLaunched(ServiceDay.of(DAY), "rs_other")).toBe(false);
  });
});
