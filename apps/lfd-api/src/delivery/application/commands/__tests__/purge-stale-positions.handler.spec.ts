import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { GesturePositionPruner } from "../../../domain/ports/gesture-position.pruner.js";
import { POSITION_RETENTION_DAYS } from "../../../domain/services/position-retention.js";
import {
  POSITION_PURGE_BATCH_SIZE,
  PurgeStalePositionsHandler,
} from "../purge-stale-positions.handler.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Des instants de geste qui portent encore une position, effacés par lots comme en base. */
class InMemoryPruner extends GesturePositionPruner {
  readonly limits: number[] = [];
  constructor(
    public closed: Date[],
    public arrived: Date[] = [],
  ) {
    super();
  }
  clearBatchClosedBefore(instant: Date, limit: number): Promise<number> {
    const [kept, count] = clear(this.closed, instant, limit);
    this.closed = kept;
    this.limits.push(limit);
    return Promise.resolve(count);
  }
  clearBatchArrivedBefore(instant: Date, limit: number): Promise<number> {
    const [kept, count] = clear(this.arrived, instant, limit);
    this.arrived = kept;
    return Promise.resolve(count);
  }
}

function clear(rows: Date[], instant: Date, limit: number): [Date[], number] {
  const stale = rows.filter((at) => at < instant).slice(0, limit);
  return [rows.filter((at) => !stale.includes(at)), stale.length];
}

describe("PurgeStalePositionsHandler — 60 jours, colonnes effacées", () => {
  const clock = new FixedClock(new Date());
  const daysAgo = (days: number): Date => new Date(clock.now().getTime() - days * MS_PER_DAY);

  it("efface à 61 jours, garde à 59 — clôtures ET arrivées", async () => {
    const kept = daysAgo(59);
    const pruner = new InMemoryPruner([daysAgo(61), kept], [daysAgo(61), kept]);

    await expect(new PurgeStalePositionsHandler(pruner, clock).execute()).resolves.toBe(2);

    expect(pruner.closed).toEqual([kept]);
    expect(pruner.arrived).toEqual([kept]);
  });

  it("garde un relevé exactement à la frontière", async () => {
    const pruner = new InMemoryPruner([daysAgo(POSITION_RETENTION_DAYS)]);

    await expect(new PurgeStalePositionsHandler(pruner, clock).execute()).resolves.toBe(0);
  });

  it("est idempotent, et enchaîne les lots jusqu'au lot incomplet", async () => {
    const total = POSITION_PURGE_BATCH_SIZE + 2;
    const pruner = new InMemoryPruner(Array.from({ length: total }, (_, i) => daysAgo(70 + i)));
    const handler = new PurgeStalePositionsHandler(pruner, clock);

    await expect(handler.execute()).resolves.toBe(total);
    expect(pruner.limits).toEqual([POSITION_PURGE_BATCH_SIZE, POSITION_PURGE_BATCH_SIZE]);
    await expect(handler.execute()).resolves.toBe(0);
  });
});
