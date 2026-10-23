/**
 * E2E de la constitution automatique — **ce qu'il range** : refus, rien à prélever,
 * clôture manquée.
 *
 * Découpé de `collection-autopilot.e2e-spec.ts` le 2026-10-23 ; la scène
 * commune vit dans `collection-autopilot-scene.ts`.
 */
import { cycleToConstitute } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import {
  BASE,
  clock,
  closesAt,
  ctx,
  DAY_MS,
  entity,
  fiche,
  HOUR_MS,
  pass,
  payerWithOrder,
  staff,
  useCollectionAutopilotScene,
} from "./collection-autopilot-scene.js";

useCollectionAutopilotScene();

describe("la constitution automatique (PA3)", () => {
  it("un refus est rangé `failed` avec son message, et ne se retente pas", async () => {
    const id = await entity({ complete: false });

    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["failed"]);
    expect((await pass()).runs).toEqual([]);

    const run = await ctx.prisma.collectionAutopilotRun.findFirstOrThrow();
    expect(run.outcome).toBe("failed");
    expect(run.message).not.toBeNull();
    expect((await fiche(id)).lastAutopilotRun).toMatchObject({
      outcome: "failed",
      message: run.message,
    });
  });

  it("rien à prélever : rangé, pas une erreur", async () => {
    await entity();

    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["nothing_to_collect"]);
  });

  /**
   * R4b (plan `plan-rythme-de-facturation.md`, §14) : la clôture d'avant n'a
   * jamais été tentée — l'automatisme ne l'absorbe pas en silence.
   */
  it("une clôture manquée : `missed`, pas de lot ; le lot manuel fait reprendre l'automatisme", async () => {
    const previous = cycleToConstitute(new Date(closesAt.getTime() - 1), null).closesAt;
    const beforePrevious = cycleToConstitute(new Date(previous.getTime() - 1), null).closesAt;
    await ctx.prisma.collectionFloor.update({
      where: { id: true },
      data: { floorAt: new Date(beforePrevious.getTime() - 30 * DAY_MS) },
    });
    const id = await entity();
    await payerWithOrder(id);
    await ctx.prisma.collectionAutopilotRun.create({
      data: {
        legalEntityId: id,
        cycleClosesAt: beforePrevious,
        ranAt: new Date(beforePrevious.getTime() + 2 * HOUR_MS),
        outcome: "nothing_to_collect",
      },
    });

    expect((await pass()).runs.map((run) => run.outcome)).toEqual(["missed"]);
    expect(await ctx.prisma.collectionBatch.count({ where: { legalEntityId: id } })).toBe(0);
    const ran = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "collection.autopilot_ran", subjectId: id },
    });
    expect(ran.payload).toMatchObject({ outcome: "missed", batchCount: 0 });
    expect((await fiche(id)).lastAutopilotRun).toMatchObject({
      cycleClosesAt: closesAt.toISOString(),
      outcome: "missed",
    });

    await staff().post(`${BASE}/batches`).send({ legalEntityId: id }).expect(201);
    const next = cycleToConstitute(new Date(closesAt.getTime() + 35 * DAY_MS), null).closesAt;
    clock.set(new Date(next.getTime() + 2 * HOUR_MS));

    const resumed = await pass();
    expect(resumed.runs).toHaveLength(1);
    expect(resumed.runs[0]?.outcome).not.toBe("missed");
    expect(resumed.runs[0]?.cycleClosesAt).toBe(next.toISOString());
  });
});
