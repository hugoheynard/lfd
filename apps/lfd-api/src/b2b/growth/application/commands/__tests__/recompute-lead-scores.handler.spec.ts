import type { LeadScoreView, LeadView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { LeadEvent } from "../../../domain/lead-score.js";
import { LeadEventSource } from "../../../domain/ports/lead-event-source.js";
import { LeadReader } from "../../../domain/ports/lead.reader.js";
import { LeadScoreStore } from "../../../domain/ports/lead-score.store.js";
import { RecomputeLeadScoresCommand } from "../recompute-lead-scores.command.js";
import { RecomputeLeadScoresHandler } from "../recompute-lead-scores.handler.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");

/** Source de journal doublée par EXTENSION (aucun cast interdit). */
class FakeEventSource extends LeadEventSource {
  constructor(private readonly events: LeadEvent[]) {
    super();
  }
  all(): Promise<LeadEvent[]> {
    return Promise.resolve(this.events);
  }
}

/** Reader de leads cold doublé. */
class FakeLeadReader extends LeadReader {
  constructor(private readonly leads: LeadView[] = []) {
    super();
  }
  list(): Promise<LeadView[]> {
    return Promise.resolve(this.leads);
  }
}

/** Store doublé : capture ce que le handler écrit. */
class CapturingStore extends LeadScoreStore {
  written: readonly LeadScoreView[] | null = null;
  replaceAll(rows: readonly LeadScoreView[]): Promise<void> {
    this.written = rows;
    return Promise.resolve();
  }
}

function ordered(subjectId: string, at: string, totalCents: number): LeadEvent {
  return {
    type: "order.placed",
    subjectType: "user",
    subjectId,
    occurredAt: new Date(at),
    actorType: "customer",
    payload: { totalCents, companyId: null },
  };
}

describe("RecomputeLeadScoresHandler", () => {
  it("dérive la queue au temps du Clock puis remplace le read-model, et rend le compte", async () => {
    const store = new CapturingStore();
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([ordered("u1", "2026-08-18T09:00:00.000Z", 5000)]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
    );

    const count = await handler.execute(new RecomputeLeadScoresCommand());

    expect(count).toBe(1);
    expect(store.written).toHaveLength(1);
    expect(store.written?.[0]).toMatchObject({
      subjectId: "u1",
      play: "lock_in",
      computedAt: NOW.toISOString(),
    });
  });

  it("remplace par une queue vide quand le journal ne porte aucun lead actionnable", async () => {
    const store = new CapturingStore();
    const handler = new RecomputeLeadScoresHandler(
      new FakeEventSource([]),
      new FakeLeadReader(),
      store,
      new FixedClock(NOW),
    );

    const count = await handler.execute(new RecomputeLeadScoresCommand());

    expect(count).toBe(0);
    expect(store.written).toEqual([]);
  });
});
