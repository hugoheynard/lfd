import type { LeadScoreView } from "@lfd/contracts";

import { LeadScoreReader } from "../../../domain/ports/lead-score.reader.js";
import { GetCockpitHandler } from "../get-cockpit.handler.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { TableCustomers } from "../../handlers/__tests__/order-fact-doubles.js";

/** Personne n'a de nom : le cas d'un inscrit que seul son e-mail désigne. */
const NAMELESS = new TableCustomers(new Map());

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
    const handler = new GetCockpitHandler(reader, new RecordingActivityRecorder(), NAMELESS);

    const result = await handler.execute();

    expect(reader.lastLimit).toBe(5);
    expect(result).toHaveLength(1);
    expect(result[0]?.subjectId).toBe("u1");
  });

  it("journalise reco.shown pour chaque coup affiché, clé idempotente par (sujet, fenêtre)", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([
        lead({ subjectId: "u1", computedAt: "2026-08-20T04:00:00.000Z" }),
        lead({ subjectType: "company", subjectId: "c9", play: "rescue" }),
      ]),
      recorder,
      NAMELESS,
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
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(new FakeReader([]), recorder, NAMELESS);

    const result = await handler.execute();

    expect(result).toEqual([]);
    expect(recorder.records).toHaveLength(0);
  });

  /**
   * Régression (lot B du plan des phrases, 2026-09-19) : le libellé du cockpit
   * d'une personne sans nom EST son e-mail ; le fait ne doit pas le recopier.
   */
  it("cite une personne par son nom de fiche, jamais par le libellé-e-mail du cockpit", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([lead({ subjectId: "u1" }), lead({ subjectId: "u2" })]),
      recorder,
      new TableCustomers(new Map([["u2", "Léa Petit"]])),
    );

    await handler.execute();

    expect(recorder.records.map((record) => record.payload)).toEqual([
      { play: "lock_in", score: 42 },
      { subjectLabel: "Léa Petit", play: "lock_in", score: 42 },
    ]);
    expect(JSON.stringify(recorder.records)).not.toContain("chef@resto.fr");
  });

  it("cite une société ou un prospect saisi par le libellé du cockpit, sauf s'il n'est que l'id", async () => {
    const recorder = new RecordingActivityRecorder();
    const handler = new GetCockpitHandler(
      new FakeReader([
        lead({ subjectType: "company", subjectId: "c1", label: "Boulangerie Martin" }),
        lead({ subjectType: "company", subjectId: "c2", label: "c2" }),
      ]),
      recorder,
      NAMELESS,
    );

    await handler.execute();

    expect(recorder.records.map((record) => record.payload)).toEqual([
      { subjectLabel: "Boulangerie Martin", play: "lock_in", score: 42 },
      { play: "lock_in", score: 42 },
    ]);
  });
});
