/**
 * E2E des **étapes d'une ligne** — plan
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3 et
 * § 2.8, sur le vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve :
 *
 * - **le geste** : l'étape rangée sous sa clé (jour, SKU, poste), sa version
 *   qui monte, le fait journalisé conforme au contrat, aucune fournée ;
 * - **la carte courante** : le poste qui finit et un poste étranger au
 *   produit sont refusés (409) ;
 * - **la fiche gardée** : cocher puis décocher fait relire la fiche
 *   (déclencheurs de la table) — `stepsPending` suit ;
 * - **la ligne finie** : « Fait » du poste qui finit déclare UNE fournée de
 *   10, l'étape cochée n'en compte aucune ;
 * - **la Supervision** : le rouge d'une étape, avec le nom du poste ;
 * - **la coche d'office** : l'insertion qui ignore le conflit ne touche
 *   jamais une étape déjà présente.
 */
import type { CreatedIdResponse, ProductionProblemsView } from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { AutomaticStepChecks } from "../src/production/atelier/domain/ports/line-step.ports.js";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsRepository,
} from "../src/production/shared/print/index.js";
import { E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  worksheetLine,
} from "./production-day-fixture.js";

/** Le produit du croissant au miroir du catalogue. */
const PRODUCT = "VIE-001";
/** Un instant recopié, jamais comparé à l'horloge. */
const AT = new Date("2026-11-15T18:00:00.000Z");
const LINE = `/admin/production/worksheet/${SERVICE_DAY}/lines/${CROISSANT}`;

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
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

async function station(name: string): Promise<string> {
  return jsonBody<CreatedIdResponse>(
    await ctx
      .asSub(STAFF)
      .post("/admin/production/workstations")
      .set(INTENT_KEY, freshIntent())
      .send({ name })
      .expect(201),
  ).id;
}

/**
 * Le croissant sur deux postes, en mode prod : le Salé traiteur le finit
 * (premier posé), la Boulangerie fait une étape ; une Pâtisserie en service
 * n'en est pas. Puis 10 croissants au compte, plan arrêté.
 */
async function sandwichDay(): Promise<{ bread: string; savory: string; pastry: string }> {
  const savory = await station("Salé traiteur");
  const bread = await station("Boulangerie");
  const pastry = await station("Pâtisserie");
  for (const workstationId of [savory, bread]) {
    await ctx
      .asSub(STAFF)
      .post(`/admin/production/workstations/${workstationId}/products`)
      .set(INTENT_KEY, freshIntent())
      .send({ productSkus: [PRODUCT] })
      .expect(204);
  }
  await ctx.app
    .get(ProductionDisplaySettingsRepository)
    .save(ProductionDisplaySettings.of({ showSubcategories: false, grouping: "workstation" }), AT, {
      staffUserId: E2E_STAFF_ID,
      name: null,
    });
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 10 }]);
  await closePlan(ctx);
  await settle();
  return { bread, savory, pastry };
}

function step(workstationId: string, key = freshIntent()) {
  return ctx.asSub(STAFF).post(`${LINE}/steps/${workstationId}`).set(INTENT_KEY, key).send();
}

describe("les gestes d'une étape", () => {
  it("cocher : rangée, journalisée, sans fournée ; décocher : la fiche attend de nouveau", async () => {
    const { bread } = await sandwichDay();
    expect((await worksheetLine(ctx)).stepsPending).toEqual([bread]);

    await step(bread).expect(204);

    const row = await ctx.prisma.productionLineStep.findFirstOrThrow();
    expect(row).toMatchObject({ sku: CROISSANT, workstationId: bread, status: "done", version: 1 });
    expect(await ctx.prisma.productionBatch.count()).toBe(0);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_line.step_done" },
      select: { type: true, payload: true },
    });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    expect(await worksheetLine(ctx)).toMatchObject({ stepsPending: [], done: false });

    await ctx
      .asSub(STAFF)
      .delete(`${LINE}/steps/${bread}`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);

    expect(await ctx.prisma.productionLineStep.findFirstOrThrow()).toMatchObject({
      status: "undone",
      version: 2,
    });
    expect((await worksheetLine(ctx)).stepsPending).toEqual([bread]);
  });

  it("rejoué avec la même clé, ne coche qu'une fois", async () => {
    const { bread } = await sandwichDay();
    const key = freshIntent();

    await step(bread, key).expect(204);
    await step(bread, key).expect(204);

    expect((await ctx.prisma.productionLineStep.findFirstOrThrow()).version).toBe(1);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "production_line.step_done" } }),
    ).toBe(1);
  });

  it("refuse le poste qui finit et un poste étranger au produit (409)", async () => {
    const { savory, pastry } = await sandwichDay();

    await step(savory).expect(409);
    await step(pastry).expect(409);

    expect(await ctx.prisma.productionLineStep.count()).toBe(0);
  });

  it("« Fait » du poste qui finit et l'étape cochée : une fournée de 10, la ligne finie", async () => {
    const { bread } = await sandwichDay();

    await ctx.asSub(STAFF).post(`${LINE}/done`).set(INTENT_KEY, freshIntent()).send().expect(204);
    await step(bread).expect(204);

    const batches = await ctx.prisma.productionBatch.findMany({ select: { quantity: true } });
    expect(batches).toEqual([{ quantity: 10 }]);
    expect(await worksheetLine(ctx)).toMatchObject({ done: true, produced: 10, stepsPending: [] });
  });
});

describe("le rouge d'une étape", () => {
  it("va dans la Supervision avec le nom du poste, sans plafond", async () => {
    const { bread } = await sandwichDay();

    await ctx
      .asSub(STAFF)
      .post(`${LINE}/steps/${bread}/red`)
      .set(INTENT_KEY, freshIntent())
      .send({ reason: " four à pain en panne " })
      .expect(204);

    const view = jsonBody<ProductionProblemsView>(
      await ctx
        .asSub(STAFF)
        .get(`/admin/supervision/production-problems?date=${SERVICE_DAY}`)
        .expect(200),
    );
    expect(view.problems).toEqual([]);
    expect(view.stepReds).toEqual([
      expect.objectContaining({
        sku: CROISSANT,
        workstationId: bread,
        workstationName: "Boulangerie",
        reason: "four à pain en panne",
        version: 1,
      }),
    ]);
    expect(await ctx.prisma.productionProblem.count()).toBe(0);
    expect((await worksheetLine(ctx)).stepsPending).toEqual([bread]);
  });
});

describe("la coche d'office", () => {
  it("insère ce qui manque et ne réécrit jamais une étape présente", async () => {
    const { bread, pastry } = await sandwichDay();
    await step(bread).expect(204);
    await ctx
      .asSub(STAFF)
      .delete(`${LINE}/steps/${bread}`)
      .set(INTENT_KEY, freshIntent())
      .expect(204);
    const checks = ctx.app.get(AutomaticStepChecks);
    const keys = [
      { serviceDay: SERVICE_DAY, sku: CROISSANT, workstationId: bread },
      { serviceDay: SERVICE_DAY, sku: CROISSANT, workstationId: pastry },
    ];

    expect(await checks.checkIfAbsent(keys, AT, "system:always-green")).toBe(1);
    expect(await checks.checkIfAbsent(keys, AT, "system:always-green")).toBe(0);

    const rows = await ctx.prisma.productionLineStep.findMany({
      select: { workstationId: true, status: true, checkedByStaffId: true, version: true },
    });
    const byStation = new Map(rows.map((row) => [row.workstationId, row]));
    expect(byStation.get(pastry)).toEqual({
      workstationId: pastry,
      status: "done",
      checkedByStaffId: "system:always-green",
      version: 1,
    });
    expect(byStation.get(bread)).toMatchObject({ status: "undone", version: 2 });
    expect(byStation.get(bread)?.checkedByStaffId).not.toBe("system:always-green");
  });
});
