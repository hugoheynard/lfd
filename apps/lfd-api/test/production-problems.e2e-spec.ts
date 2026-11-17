/**
 * E2E du **rouge, de « Fait » et de « Marquer traité »** —
 * `documentation/fournil/les-niveaux-de-suivi.md`, sur le vrai
 * Postgres jetable.
 *
 * Ce que seule cette suite prouve :
 *
 * - **le rouge** : la part corrigée écrite sur la fournée remise (CHECK
 *   compris), le problème rangé une fois par journée et SKU, le fait
 *   `production.output_corrected` dans la boîte d'envoi sous sa clé, le fait
 *   journalisé conforme au contrat, la cloche validée, le niveau figé ;
 * - **« Fait »** : une fournée du reste, une seule ;
 * - **la Supervision** : les problèmes ouverts, puis « Marquer traité » ;
 * - **la borne du retour** : une fournée corrigée ne redemande au colisage
 *   que ce qu'il tient encore.
 *
 * La mise en service est remplacée par une date lointaine, comme dans la
 * suite des niveaux de suivi : sinon aucune journée de test ne serait figée.
 */
import type { ProductionProblemsView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { OutputCorrectionsReader } from "../src/production/channels/packing/index.js";
import { TrackingLevelsCommissioning } from "../src/production/atelier/domain/ports/tracking-levels-commissioning.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  cancelBatch,
  closePlan,
  place,
  recordBatch,
  worksheetLine,
} from "./production-day-fixture.js";

const LINE = `/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}`;
const PROBLEMS = "/admin/supervision/production-problems";
const FIRST = "01K6A0000000000000000000A1";
const OUTPUT_CORRECTED = "production.output_corrected";

const COMMISSIONED_LONG_AGO = { since: (): Date => new Date(0) };

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: TrackingLevelsCommissioning, value: COMMISSIONED_LONG_AGO },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** 24 croissants au compte, plan arrêté. */
async function closedDayOfTwentyFour(): Promise<void> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 24 }]);
  await closePlan(ctx);
  await settle();
}

function red(body: object, key = freshIntent()) {
  return ctx.asSub(STAFF).post(`${LINE}/problem`).set(INTENT_KEY, key).send(body);
}

function done(key = freshIntent()) {
  return ctx.asSub(STAFF).post(`${LINE}/done`).set(INTENT_KEY, key).send();
}

async function openProblems(): Promise<ProductionProblemsView> {
  return jsonBody<ProductionProblemsView>(
    await ctx.asSub(STAFF).get(`${PROBLEMS}?date=${SERVICE_DAY}`).expect(200),
  );
}

describe("le rouge", () => {
  it("corrige la fournée remise, pose le plafond, publie, journalise et sonne", async () => {
    await closedDayOfTwentyFour();
    expect(await recordBatch(ctx, FIRST, 24)).toBe(204);

    await red({ produced: 15, reason: " four en panne " }).expect(204);
    await settle();

    const batch = await ctx.prisma.productionBatch.findUniqueOrThrow({ where: { id: FIRST } });
    expect(batch.correctedQuantity).toBe(9);
    expect(await worksheetLine(ctx)).toMatchObject({ produced: 15, remaining: 9 });
    const problem = await ctx.prisma.productionProblem.findFirstOrThrow();
    expect(problem).toMatchObject({
      expected: 24,
      produced: 15,
      reason: "four en panne",
      version: 1,
    });
    const corrected = await ctx.prisma.outboxMessage.findMany({
      where: { type: OUTPUT_CORRECTED },
    });
    expect(corrected.map((row) => row.key)).toEqual([`${OUTPUT_CORRECTED}:${problem.id}:1`]);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_problem.reported" },
      select: { type: true, payload: true },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    expect(
      await ctx.prisma.staffNotification.count({
        where: { idempotencyKey: `problème:${problem.id}:1` },
      }),
    ).toBe(1);
    expect(await ctx.prisma.productionDayTrackingLevel.count()).toBe(1);
    expect(await ctx.app.get(OutputCorrectionsReader).correctionsOf(SERVICE_DAY)).toEqual([
      { handoffId: FIRST, sku: CROISSANT, corrected: 9 },
    ]);
  });

  it("rejoué avec la même clé, ne refait rien", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 24);
    const key = freshIntent();

    await red({ produced: 15 }, key).expect(204);
    await red({ produced: 15 }, key).expect(204);

    expect((await ctx.prisma.productionProblem.findFirstOrThrow()).version).toBe(1);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: OUTPUT_CORRECTED } })).toBe(1);
  });

  it("au-dessus du sorti, déclare la différence par une fournée", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 10);

    await red({ produced: 16 }).expect(204);

    expect((await worksheetLine(ctx)).produced).toBe(16);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: OUTPUT_CORRECTED } })).toBe(0);
  });

  it("refuse un sorti négatif en nommant le cas, sans rien écrire", async () => {
    await closedDayOfTwentyFour();

    const refused = await red({ produced: -1 }).expect(400);

    expect(jsonBody<{ code: string }>(refused).code).toBe("production.problem.invalid_output");
    expect(await ctx.prisma.productionProblem.count()).toBe(0);
  });

  it("une fournée corrigée ne redemande au colisage que ce qu'il tient encore", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 24);
    await red({ produced: 15 }).expect(204);

    expect(await cancelBatch(ctx, FIRST)).toBe(204);

    const asked = await ctx.prisma.productionReturnRequest.findMany({ where: { batchId: FIRST } });
    expect(asked.map((row) => row.quantity)).toEqual([15]);
  });
});

describe("« Fait »", () => {
  it("déclare une fournée du reste, une seule fois, sous le plafond", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 10);

    await done().expect(204);
    await done().expect(204);

    expect((await worksheetLine(ctx)).produced).toBe(24);
    expect(await ctx.prisma.productionBatch.count()).toBe(2);
  });
});

describe("la Supervision des problèmes", () => {
  it("sert le problème ouvert, puis plus rien une fois traité ; le plafond reste", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 24);
    await red({ produced: 20 }).expect(204);

    const [open] = (await openProblems()).problems;
    expect(open).toMatchObject({ sku: CROISSANT, expected: 24, produced: 20, output: 20 });

    await ctx
      .asSub(STAFF)
      .post(`${PROBLEMS}/${open?.id ?? ""}/resolve`)
      .set(INTENT_KEY, freshIntent())
      .send()
      .expect(204);

    expect((await openProblems()).problems).toEqual([]);
    const stored = await ctx.prisma.productionProblem.findFirstOrThrow();
    expect(stored.resolvedAt).not.toBeNull();
    expect(stored.produced).toBe(20);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_problem.resolved" },
      select: { type: true, payload: true },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
  });
});

describe("la fiche sert le plafond et le rouge ouvert (N4)", () => {
  it("relit la fiche après un rouge, sert le plafond, puis le garde une fois traité", async () => {
    await closedDayOfTwentyFour();
    await recordBatch(ctx, FIRST, 12);
    // Lue AVANT le rouge : le cache de la fiche doit suivre la table des problèmes.
    expect(await worksheetLine(ctx)).toMatchObject({
      ceiling: null,
      remainingUnderCeiling: 12,
      problem: null,
    });

    await red({ produced: 10, reason: "brûlé" }).expect(204);
    await settle();

    const line = await worksheetLine(ctx);
    expect(line).toMatchObject({
      produced: 10,
      ceiling: 10,
      remainingUnderCeiling: 0,
      problem: { version: 1, expected: 24, produced: 10, reason: "brûlé" },
    });
    await ctx
      .asSub(STAFF)
      .post(`${PROBLEMS}/${line.problem?.id ?? ""}/resolve`)
      .set(INTENT_KEY, freshIntent())
      .send()
      .expect(204);

    expect(await worksheetLine(ctx)).toMatchObject({ ceiling: 10, problem: null });
  });
});
