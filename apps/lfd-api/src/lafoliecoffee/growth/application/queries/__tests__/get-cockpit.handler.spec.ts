import type { LeadScoreView } from "@lfd/contracts";

import { LeadScoreReader } from "../../../domain/ports/lead-score.reader.js";
import { GetCockpitHandler } from "../get-cockpit.handler.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";

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

function lead(overrides: Partial<LeadScoreView> = {}): LeadScoreView {
  return {
    subjectType: "lead",
    subjectId: "lead_1",
    label: "Bistrot du Coin",
    play: "nurture",
    score: 42,
    reason: "…",
    recencyDays: 2,
    computedAt: "2026-08-20T04:00:00.000Z",
    ...overrides,
  };
}

describe("GetCockpitHandler", () => {
  it("demande les 5 meilleurs coups et les rend tels quels", async () => {
    const reader = new FakeReader([lead()]);
    const handler = new GetCockpitHandler(reader, new RecordingActivityRecorder());

    const result = await handler.execute();

    expect(reader.lastLimit).toBe(5);
    expect(result).toHaveLength(1);
    expect(result[0]?.subjectId).toBe("lead_1");
  });

  it("journalise reco.shown pour chaque coup affiché, clé idempotente par (sujet, fenêtre)", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([
        lead({ subjectId: "lead_1", computedAt: "2026-08-20T04:00:00.000Z" }),
        lead({ subjectType: "company", subjectId: "c9", play: "rescue" }),
      ]),
      recorder,
    );

    await handler.execute();

    expect(recorder.records).toHaveLength(2);
    expect(recorder.records[0]).toMatchObject({
      type: "reco.shown",
      subjectType: "lead",
      subjectId: "lead_1",
      idempotencyKey: "reco.shown:lead:lead_1:2026-08-20T04:00:00.000Z",
      payload: { subjectLabel: "Bistrot du Coin", play: "nurture", score: 42 },
      bySystem: true,
    });
    expect(recorder.records[1]?.subjectType).toBe("company");
  });

  it("ne journalise rien quand la queue est vide", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(new FakeReader([]), recorder);

    const result = await handler.execute();

    expect(result).toEqual([]);
    expect(recorder.records).toHaveLength(0);
  });

  it("cite une société ou un prospect saisi par le libellé du cockpit, sauf s'il n'est que l'id", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([
        lead({
          subjectType: "company",
          subjectId: "c1",
          label: "Boulangerie Martin",
          play: "rescue",
        }),
        lead({ subjectType: "company", subjectId: "c2", label: "c2", play: "rescue" }),
      ]),
      recorder,
    );

    await handler.execute();

    expect(recorder.records.map((record) => record.payload)).toEqual([
      { subjectLabel: "Boulangerie Martin", play: "rescue", score: 42 },
      { play: "rescue", score: 42 },
    ]);
  });
});
