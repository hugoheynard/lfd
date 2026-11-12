import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PIM_CHANGE_RETENTION_MS, PimChangePruner } from "../../domain/ports/pim-change.pruner.js";
import { PrunePimChangesHandler } from "../prune-pim-changes.js";

class RecordingPruner extends PimChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(4);
  }
}

describe("PrunePimChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PrunePimChangesHandler(pruner, clock).execute()).resolves.toBe(4);

    expect(pruner.cutoffs).toEqual([new Date(clock.now().getTime() - PIM_CHANGE_RETENTION_MS)]);
  });
});
