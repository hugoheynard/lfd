import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DELIVERY_DAY_CHANGE_RETENTION_MS,
  DeliveryDayChangePruner,
} from "../../../domain/ports/delivery-day-change.pruner.js";
import { PruneDeliveryDayChangesHandler } from "../prune-delivery-day-changes.handler.js";

class RecordingPruner extends DeliveryDayChangePruner {
  readonly cutoffs: Date[] = [];
  pruneBefore(instant: Date): Promise<number> {
    this.cutoffs.push(instant);
    return Promise.resolve(3);
  }
}

describe("PruneDeliveryDayChangesHandler", () => {
  it("balaie ce qui a plus de sept jours à l'heure du port, et rend le compte", async () => {
    const clock = new FixedClock(new Date());
    const pruner = new RecordingPruner();

    await expect(new PruneDeliveryDayChangesHandler(pruner, clock).execute()).resolves.toBe(3);

    expect(pruner.cutoffs).toEqual([
      new Date(clock.now().getTime() - DELIVERY_DAY_CHANGE_RETENTION_MS),
    ]);
  });
});
