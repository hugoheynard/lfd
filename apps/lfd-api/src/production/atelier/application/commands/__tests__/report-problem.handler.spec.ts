import {
  InvalidProblemOutputError,
  ProblemOutputAboveCountError,
} from "../../../domain/errors/problem-errors.js";
import {
  nextIntent,
  problemScene,
  SCENE_COUNT,
  SCENE_DAY,
  SCENE_NOW,
  SCENE_SKU,
} from "../../__tests__/problem-scene.js";
import { CancelBatchCommand } from "../cancel-batch.command.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { ReportProblemCommand } from "../report-problem.command.js";

/**
 * **Le rouge** (`fournil/les-niveaux-de-suivi.md`), ports doublés.
 */
const OUTPUT_CORRECTED = "production.output_corrected";

function red(produced: number, reason: string | null = null, key = nextIntent()) {
  return new ReportProblemCommand(SCENE_DAY, SCENE_SKU, produced, reason, "staff-1", key);
}

async function withBatches(...quantities: readonly number[]) {
  const scene = problemScene();
  for (const [index, quantity] of quantities.entries()) {
    await scene.record.execute(
      new RecordBatchCommand(
        SCENE_DAY,
        SCENE_SKU,
        `b${String(index + 1)}`,
        quantity,
        "",
        "staff-2",
      ),
    );
  }
  return scene;
}

async function outputOf(scene: ReturnType<typeof problemScene>): Promise<number> {
  return (await scene.days.load()).producedOf(SCENE_SKU);
}

describe("ReportProblemHandler — moins que sorti", () => {
  it("corrige les fournées remises les plus récentes, pose le plafond, publie la correction", async () => {
    const scene = await withBatches(80, 40);

    await scene.report.execute(red(90, "four en panne"));

    expect(scene.store.batches.map((batch) => [batch.id, batch.corrected])).toEqual([
      ["b1", 0],
      ["b2", 30],
    ]);
    expect(await outputOf(scene)).toBe(90);
    expect(scene.problems.of(SCENE_DAY, SCENE_SKU)).toMatchObject({
      expected: SCENE_COUNT,
      produced: 90,
      reason: "four en panne",
      version: 1,
      reported: { at: SCENE_NOW, staffId: "staff-1", name: "Marie Dupont" },
    });
    const facts = scene.durable.of(OUTPUT_CORRECTED);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      key: `${OUTPUT_CORRECTED}:pb_000001:1`,
      payload: {
        serviceDay: SCENE_DAY,
        sku: SCENE_SKU,
        batches: [{ handoffId: "b2", corrected: 30, totalCorrected: 30 }],
      },
    });
  });

  it("saute la fournée en retour en attente, corrige ce qu'il peut et le journal dit le reste", async () => {
    const scene = await withBatches(20, 30);
    await scene.cancel.execute(new CancelBatchCommand(SCENE_DAY, "b2", "staff-3"));

    await scene.report.execute(red(0));

    expect(scene.store.batches.map((batch) => batch.corrected)).toEqual([20, 0]);
    expect(scene.events.traced[0]?.journalFact()).toMatchObject({
      type: "production_problem.reported",
      payload: {
        subjectLabel: "Croissant",
        output: 50,
        produced: 0,
        correctedBatches: [{ batchId: "b1", corrected: 20 }],
        uncorrected: 30,
        declared: 0,
      },
    });
  });

  it("ne publie pas de correction quand rien n'était corrigeable", async () => {
    const scene = await withBatches(30);
    await scene.cancel.execute(new CancelBatchCommand(SCENE_DAY, "b1", "staff-3"));

    await scene.report.execute(red(10));

    expect(scene.durable.of(OUTPUT_CORRECTED)).toEqual([]);
    expect(scene.problems.of(SCENE_DAY, SCENE_SKU)?.produced).toBe(10);
  });
});

describe("ReportProblemHandler — plus que sorti", () => {
  it("déclare la différence par une fournée ordinaire, remise au colisage", async () => {
    const scene = await withBatches(10);

    await scene.report.execute(red(SCENE_COUNT));

    const declared = scene.store.batches.find((batch) => batch.id === "problem-pb_000001-1");
    expect(declared).toMatchObject({ sku: SCENE_SKU, quantity: SCENE_COUNT - 10, corrected: 0 });
    expect(scene.ledger.handoffs.map((handoff) => handoff.id)).toContain("problem-pb_000001-1");
    expect(scene.durable.of(OUTPUT_CORRECTED)).toEqual([]);
    expect(await outputOf(scene)).toBe(SCENE_COUNT);
  });
});

describe("ReportProblemHandler — le geste", () => {
  it("fige la journée sous le verrou, avant de relire", async () => {
    const scene = await withBatches(40);
    scene.trace.splice(0);

    await scene.report.execute(red(30));

    expect(scene.frozen.rows.has(SCENE_DAY)).toBe(true);
    expect(scene.trace.slice(0, 2)).toEqual([`lock:${SCENE_DAY}`, `lock:${SCENE_DAY}`]);
    expect(scene.trace.indexOf(`freeze:${SCENE_DAY}`)).toBeLessThan(
      scene.trace.lastIndexOf("load"),
    );
  });

  it("ne sonne la cloche qu'après la validation", async () => {
    const scene = await withBatches(40);

    await scene.report.execute(red(30, "brûlés"));

    expect(scene.notifier.notices).toEqual([]);
    await scene.afterCommit.commit();
    expect(scene.notifier.notices).toEqual([
      expect.objectContaining({
        kind: "production.problem_reported",
        audience: "b2b_supervision:read",
        idempotencyKey: "problème:pb_000001:1",
        link: `/fournil?jour=${SCENE_DAY}&ligne=${SCENE_SKU}`,
      }),
    ]);
  });

  it("une unité qui échoue ne sonne pas", async () => {
    const scene = await withBatches(40);

    await scene.report.execute(red(30));
    scene.afterCommit.discard();
    await scene.afterCommit.commit();

    expect(scene.notifier.notices).toEqual([]);
  });

  it("un second rouge remplace le premier : même id, version 2, nouvelle clé", async () => {
    const scene = await withBatches(80);
    await scene.report.execute(red(60));

    await scene.report.execute(red(50));

    expect(scene.problems.rows.size).toBe(1);
    expect(scene.problems.of(SCENE_DAY, SCENE_SKU)).toMatchObject({ produced: 50, version: 2 });
    expect(scene.durable.of(OUTPUT_CORRECTED).map((fact) => fact.key)).toEqual([
      `${OUTPUT_CORRECTED}:pb_000001:1`,
      `${OUTPUT_CORRECTED}:pb_000001:2`,
    ]);
    expect(scene.store.batches[0]?.corrected).toBe(30);
  });

  it("rejoué avec la même clé, ne refait rien", async () => {
    const scene = await withBatches(80);
    const key = nextIntent();

    await scene.report.execute(red(60, null, key));
    await scene.report.execute(red(60, null, key));

    expect(scene.problems.saves).toBe(1);
    expect(scene.events.traced).toHaveLength(1);
  });

  it("refuse un sorti négatif sans rien écrire", async () => {
    const scene = await withBatches(80);

    await expect(scene.report.execute(red(-2))).rejects.toBeInstanceOf(InvalidProblemOutputError);
    expect(scene.problems.saves).toBe(0);
    expect(scene.store.batches[0]?.corrected).toBe(0);
  });

  it("refuse un sorti au-delà du compte et du déjà déclaré : une faute de frappe ne déclare pas de surplus", async () => {
    const scene = await withBatches(10);

    await expect(scene.report.execute(red(SCENE_COUNT + 1))).rejects.toBeInstanceOf(
      ProblemOutputAboveCountError,
    );
    expect(scene.problems.saves).toBe(0);
    expect(scene.store.batches).toHaveLength(1);
  });

  it("admet le compte du jour, ou ce qui est déjà déclaré s'il le dépasse", async () => {
    const scene = await withBatches(80);

    await scene.report.execute(red(80));

    expect(scene.problems.saves).toBe(1);
  });
});

describe("la borne du retour, après un rouge", () => {
  it("annuler une fournée corrigée ne redemande que ce que le colisage tient encore", async () => {
    const scene = await withBatches(30);
    await scene.report.execute(red(20));

    await scene.cancel.execute(new CancelBatchCommand(SCENE_DAY, "b1", "staff-3"));

    const asked = scene.durable.of("production.return_requested");
    expect(asked.map((fact) => fact.payload["quantity"])).toEqual([20]);
  });

  it("une fournée entièrement corrigée s'annule tout de suite : le colisage n'a rien à rendre", async () => {
    const scene = await withBatches(30);
    await scene.report.execute(red(0));

    await scene.cancel.execute(new CancelBatchCommand(SCENE_DAY, "b1", "staff-3"));

    expect(scene.durable.of("production.return_requested")).toEqual([]);
    expect(scene.store.batches[0]?.cancelled).not.toBeNull();
  });
});
