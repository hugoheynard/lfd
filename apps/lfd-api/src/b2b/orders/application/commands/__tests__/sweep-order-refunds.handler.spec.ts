import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import { OrderRefundRequestReader } from "../../../domain/ports/order-refund-request.reader.js";
import { REFUND_SWEEP_LIMIT } from "../sweep-order-refunds.command.js";
import { SweepOrderRefundsHandler } from "../sweep-order-refunds.handler.js";
import { RecordingDispatch } from "./refund-doubles.js";

/** Le balayage (C4.7 (b)) : au plus 20, l'échec de l'un ne prive pas les autres. */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));

class FixedDue extends OrderRefundRequestReader {
  readonly asked: { readonly at: Date; readonly limit: number }[] = [];

  constructor(private readonly due: readonly string[]) {
    super();
  }

  dueForSweep(at: Date, limit: number): Promise<readonly string[]> {
    this.asked.push({ at, limit });
    return Promise.resolve(this.due.slice(0, limit));
  }

  paymentIntentOf(): Promise<string | null> {
    return Promise.resolve(null);
  }

  snapshotOf(): Promise<null> {
    return Promise.resolve(null);
  }
}

describe("SweepOrderRefundsHandler", () => {
  it("demande au plus 20 demandes dues à l'horloge murale, et les exécute une à une", async () => {
    const reader = new FixedDue(Array.from({ length: 25 }, (_, i) => `ord_${String(i)}`));
    const dispatch = new RecordingDispatch();

    const report = await new SweepOrderRefundsHandler(
      reader,
      dispatch,
      new FixedWallClock(NOW),
    ).execute();

    expect(reader.asked).toEqual([{ at: NOW, limit: REFUND_SWEEP_LIMIT }]);
    expect(dispatch.issued).toHaveLength(20);
    expect(report).toEqual({ taken: 20 });
  });

  it("un exécuteur qui lève ne prive pas les suivants", async () => {
    const dispatch = new RecordingDispatch("ord_1");

    await new SweepOrderRefundsHandler(
      new FixedDue(["ord_1", "ord_2"]),
      dispatch,
      new FixedWallClock(NOW),
    ).execute();

    expect(dispatch.issued).toEqual(["ord_1", "ord_2"]);
  });
});
