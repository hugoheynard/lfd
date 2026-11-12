import type { PurgeCensus } from "../../retention/purge-mode.js";
import { FixedClock } from "../../time/fixed-clock.js";
import { GestureIntentPruner } from "../gesture-intent-pruner.js";
import {
  GESTURE_INTENT_PURGE_BATCH_SIZE,
  GESTURE_INTENT_RETENTION_DAYS,
  gestureIntentPurgeCutoff,
} from "../gesture-intent-retention.js";
import { PurgeGestureIntentsHandler } from "../purge-gesture-intents.handler.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const clock = new FixedClock(new Date());
const daysAgo = (days: number): Date => new Date(clock.now().getTime() - days * MS_PER_DAY);

/** Des instants de réclamation en mémoire, jugés par `< cutoff` comme le SQL. */
class InMemoryGestureIntentPruner extends GestureIntentPruner {
  readonly batches: number[] = [];
  constructor(public claimedAts: Date[]) {
    super();
  }
  census(cutoff: Date): Promise<PurgeCensus> {
    const doomed = this.claimedAts.filter((at) => at < cutoff);
    const oldest = doomed.reduce<Date | null>(
      (min, at) => (min === null || at < min ? at : min),
      null,
    );
    return Promise.resolve({ count: doomed.length, oldest });
  }
  pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const doomed = this.claimedAts.filter((at) => at < cutoff).slice(0, limit);
    this.claimedAts = this.claimedAts.filter((at) => !doomed.includes(at));
    this.batches.push(doomed.length);
    return Promise.resolve(doomed.length);
  }
}

describe("gestureIntentPurgeCutoff", () => {
  it("recule de sept jours depuis l'heure donnée", () => {
    expect(gestureIntentPurgeCutoff(clock.now())).toEqual(daysAgo(GESTURE_INTENT_RETENTION_DAYS));
  });
});

describe("PurgeGestureIntentsHandler", () => {
  it("supprime l'intention de huit jours, garde celle de six, et le dit", async () => {
    const oldest = daysAgo(8);
    const pruner = new InMemoryGestureIntentPruner([oldest, daysAgo(6)]);

    await expect(new PurgeGestureIntentsHandler(pruner, clock).execute()).resolves.toEqual({
      mode: "on",
      eligible: 1,
      purged: 1,
      oldest,
    });
    expect(pruner.claimedAts).toEqual([daysAgo(6)]);
  });

  it("garde une intention réclamée exactement à la frontière (strictement avant)", async () => {
    const pruner = new InMemoryGestureIntentPruner([daysAgo(GESTURE_INTENT_RETENTION_DAYS)]);

    await new PurgeGestureIntentsHandler(pruner, clock).execute();

    expect(pruner.claimedAts).toHaveLength(1);
  });

  it("supprime par lots bornés jusqu'au lot incomplet", async () => {
    const many = Array.from({ length: GESTURE_INTENT_PURGE_BATCH_SIZE + 1 }, (_, index) =>
      daysAgo(8 + index / 1_000),
    );
    const pruner = new InMemoryGestureIntentPruner(many);

    await expect(new PurgeGestureIntentsHandler(pruner, clock).execute()).resolves.toMatchObject({
      purged: GESTURE_INTENT_PURGE_BATCH_SIZE + 1,
    });
    expect(pruner.batches).toEqual([GESTURE_INTENT_PURGE_BATCH_SIZE, 1]);
  });

  it("rejouée, ne trouve plus rien", async () => {
    const pruner = new InMemoryGestureIntentPruner([daysAgo(9)]);
    const handler = new PurgeGestureIntentsHandler(pruner, clock);
    await handler.execute();

    await expect(handler.execute()).resolves.toMatchObject({ eligible: 0, purged: 0 });
  });
});
