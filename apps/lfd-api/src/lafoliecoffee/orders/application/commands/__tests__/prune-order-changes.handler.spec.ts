import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ORDER_CHANGE_RETENTION_MS,
  OrderChangePruner,
} from "../../../domain/ports/order-change.pruner.js";
import { PruneOrderChangesHandler } from "../prune-order-changes.handler.js";

class RecordingPruner extends OrderChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(3);
  }
}

describe("PruneOrderChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneOrderChangesHandler(pruner, clock).execute()).resolves.toBe(3);

    expect(pruner.cutoffs).toEqual([new Date(clock.now().getTime() - ORDER_CHANGE_RETENTION_MS)]);
  });
});
