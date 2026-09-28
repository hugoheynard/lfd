import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  ORDER_DAY_CHANGE_RETENTION_MS,
  OrderDayChangePruner,
} from "../../../domain/ports/order-day-change.pruner.js";
import { PruneOrderDayChangesHandler } from "../prune-order-day-changes.handler.js";

class RecordingPruner extends OrderDayChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(5);
  }
}

describe("PruneOrderDayChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneOrderDayChangesHandler(pruner, clock).execute()).resolves.toBe(5);

    expect(pruner.cutoffs).toEqual([
      new Date(clock.now().getTime() - ORDER_DAY_CHANGE_RETENTION_MS),
    ]);
  });
});
