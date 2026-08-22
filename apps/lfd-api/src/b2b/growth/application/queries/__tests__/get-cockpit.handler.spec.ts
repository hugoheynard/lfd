import type { LeadScoreView } from "@lfd/contracts";

import type { RecordActivityInput } from "../../../domain/activity-event.js";
import { ActivityRecorder } from "../../../domain/ports/activity-recorder.js";
import { LeadScoreReader } from "../../../domain/ports/lead-score.reader.js";
import { GetCockpitHandler } from "../get-cockpit.handler.js";

/** Reader doublé par EXTENSION : rend une queue figée. */
class FakeReader extends LeadScoreReader {
  lastLimit = 0;
  constructor(private readonly rows: LeadScoreView[]) {
    super();
  }
  topPlays(limit: number): Promise<LeadScoreView[]> {
    this.lastLimit = limit;
    return Promise.resolve(this.rows);
  }
}

/** Recorder doublé : capture les faits journalisés. */
class CapturingRecorder extends ActivityRecorder {
  readonly records: RecordActivityInput[] = [];
  record(input: RecordActivityInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

function lead(overrides: Partial<LeadScoreView> = {}): LeadScoreView {
  return {
    subjectType: "user",
    subjectId: "u1",
    label: "chef@resto.fr",
    play: "lock_in",
    score: 42,
    reason: "…",
    momentum: "stable",
    monetaryCents: 5000,
    recencyDays: 2,
    computedAt: "2026-08-20T04:00:00.000Z",
    ...overrides,
  };
}

describe("GetCockpitHandler", () => {
  it("demande les 5 meilleurs coups et les rend tels quels", async () => {
    const reader = new FakeReader([lead()]);
    const handler = new GetCockpitHandler(reader, new CapturingRecorder());

    const result = await handler.execute();

    expect(reader.lastLimit).toBe(5);
    expect(result).toHaveLength(1);
    expect(result[0]?.subjectId).toBe("u1");
  });

  it("journalise reco.shown pour chaque coup affiché, clé idempotente par (sujet, fenêtre)", async () => {
    const recorder = new CapturingRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([
        lead({ subjectId: "u1", computedAt: "2026-08-20T04:00:00.000Z" }),
        lead({ subjectType: "company", subjectId: "c9", play: "rescue" }),
      ]),
      recorder,
    );

    await handler.execute();

    expect(recorder.records).toHaveLength(2);
    expect(recorder.records[0]).toMatchObject({
      type: "reco.shown",
      subjectType: "user",
      subjectId: "u1",
      idempotencyKey: "reco.shown:user:u1:2026-08-20T04:00:00.000Z",
      payload: { play: "lock_in", score: 42 },
    });
    expect(recorder.records[1]?.subjectType).toBe("company");
  });

  it("ne journalise rien quand la queue est vide", async () => {
    const recorder = new CapturingRecorder();
    const handler = new GetCockpitHandler(new FakeReader([]), recorder);

    const result = await handler.execute();

    expect(result).toEqual([]);
    expect(recorder.records).toHaveLength(0);
  });
});
