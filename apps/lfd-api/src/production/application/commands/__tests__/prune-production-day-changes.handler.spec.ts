import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DAY_CHANGE_RETENTION_MS,
  ProductionDayChangePruner,
} from "../../../domain/ports/production-day-change.pruner.js";
import { PruneProductionDayChangesHandler } from "../prune-production-day-changes.handler.js";

class RecordingPruner extends ProductionDayChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(3);
  }
}

describe("PruneProductionDayChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneProductionDayChangesHandler(pruner, clock).execute()).resolves.toBe(3);

    expect(pruner.cutoffs).toEqual([new Date(clock.now().getTime() - DAY_CHANGE_RETENTION_MS)]);
  });
});
