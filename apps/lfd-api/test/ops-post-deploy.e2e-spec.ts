/**
 * E2E des **opérations après déploiement** —
 * `documentation/ops/plan-operations-apres-deploiement.md`, § 5 et § 7.
 *
 * Ce que seul ce niveau prouve : le mur (`ops_post_deploy` lu en base), la
 * simulation qui n'écrit que sa trace, l'application en tâche qui écrit au nom
 * de qui clique — le fait tarifaire le nomme —, rejouée sans rien changer,
 * le refus sans simulation, et l'index unique partiel qui refuse une seconde
 * application en cours. L'opération éprouvée est celle des mercuriales.
 *
 * Les dates sont relatives à maintenant (`daysAgo`) : aucune n'est écrite en dur.
 */
import type {
  PostDeployOverview,
  PostDeployRunStarted,
  PostDeployRunView,
} from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const ROUTE = "/admin/ops/post-deploy";
const POLICIES = "mercuriale-promotion-policies";
const DISCOUNTS = "order-discounts";
const READ = { acknowledged: true };

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/**
 * Une mercuriale encore à « Aucune » et une promotion cochée « aussi pour
 * les tarifs négociés » qui vise tout le monde — l'état d'avant la migration
 * « la mercuriale décide ». La case n'est plus posable par l'écran : elle
 * s'écrit ici comme la base la porte encore.
 */
async function pendingPolicy(): Promise<{ readonly mercurialeId: string }> {
  const company = await createCompany(ctx.prisma);
  await staff()
    .post(`/admin/pricing/companies/${company.id}/mercuriale`)
    .send({
      label: "Mercuriale négociée",
      validFrom: daysAgo(30),
      validTo: daysAgo(-300),
      lines: [{ sku: "VIE-001-1", unitPriceMillicents: 150_000 }],
    })
    .expect(201);
  const promotionId = await posePromotion(staff(), promotionTerms({ internalName: "Rentrée" }));
  await ctx.prisma.promotion.update({
    where: { id: promotionId },
    data: { stacksOverMercuriale: true },
  });
  const row = await ctx.prisma.companyMercuriale.findFirstOrThrow({
    where: { companyId: company.id },
    select: { id: true },
  });
  return { mercurialeId: row.id };
}

async function overview(): Promise<PostDeployOverview> {
  return jsonBody<PostDeployOverview>(await staff().get(ROUTE).expect(200));
}

async function simulate(key: string): Promise<string> {
  return jsonBody<PostDeployRunStarted>(await staff().post(`${ROUTE}/${key}/simulate`).expect(201))
    .runId;
}

async function run(runId: string): Promise<PostDeployRunView> {
  return jsonBody<PostDeployRunView>(await staff().get(`${ROUTE}/runs/${runId}`).expect(200));
}

function policyOf(mercurialeId: string) {
  return ctx.prisma.companyMercuriale.findUniqueOrThrow({
    where: { id: mercurialeId },
    select: { promotionMode: true },
  });
}

describe("le mur", () => {
  it("refuse une personne sans le droit `ops_post_deploy` (403), même pour simuler", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "commercial",
        email: "commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: "staff-commercial",
      },
    });
    const commercial = ctx.asSub("staff-commercial");

    expect((await commercial.get(ROUTE)).status).toBe(403);
    expect((await commercial.post(`${ROUTE}/${POLICIES}/simulate`)).status).toBe(403);
  });
});

describe("la liste", () => {
  it("rien à faire sur une base propre : le bandeau ne s'affiche pas", async () => {
    const list = await overview();

    expect(list.revision).toBe(ctx.app.get(AppConfig).revision());
    expect(list.anyToDo).toBe(false);
    expect(list.operations.map((operation) => operation.key)).toEqual([POLICIES, DISCOUNTS]);
  });

  it("une mercuriale à régler rend l'opération à faire, et bloque la suivante", async () => {
    await pendingPolicy();

    const list = await overview();

    expect(list.anyToDo).toBe(true);
    expect(list.operations[0]).toMatchObject({ key: POLICIES, toDo: true, lastRun: null });
    expect(list.operations[1]).toMatchObject({ key: DISCOUNTS, blockedBy: [POLICIES] });
  });
});

describe("simuler puis appliquer", () => {
  it("la simulation n'écrit que sa trace", async () => {
    const { mercurialeId } = await pendingPolicy();

    const runId = await simulate(POLICIES);

    expect(await policyOf(mercurialeId)).toEqual({ promotionMode: "none" });
    expect(await run(runId)).toMatchObject({
      state: "simulated",
      simulatedBy: E2E_STAFF_ID,
      simulation: { writable: 1 },
    });
  });

  it("refuse d'appliquer sans simulation (409, « simulez d'abord »)", async () => {
    await pendingPolicy();

    const response = await staff().post(`${ROUTE}/${POLICIES}/apply`).send(READ);

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("Simulez d'abord");
  });

  it("refuse d'appliquer sans « j'ai lu » (400)", async () => {
    await pendingPolicy();
    await simulate(POLICIES);

    expect((await staff().post(`${ROUTE}/${POLICIES}/apply`).send({})).status).toBe(400);
  });

  it("applique au nom de qui clique, puis se rejoue sans rien changer", async () => {
    const { mercurialeId } = await pendingPolicy();
    await simulate(POLICIES);

    const runId = jsonBody<PostDeployRunStarted>(
      await staff().post(`${ROUTE}/${POLICIES}/apply`).send(READ).expect(202),
    ).runId;
    await ctx.drain();

    expect(await run(runId)).toMatchObject({ state: "succeeded", progress: { writable: 1 } });
    expect(await policyOf(mercurialeId)).toEqual({ promotionMode: "selected" });
    const facts = await ctx.prisma.pricingEvent.findMany({
      where: { subjectId: mercurialeId, summary: { startsWith: "Reprise" } },
      select: { actor: true },
    });
    expect(facts).toEqual([{ actor: E2E_STAFF_ID }]);

    // Une simulation ne s'applique qu'une fois.
    expect((await staff().post(`${ROUTE}/${POLICIES}/apply`).send(READ)).status).toBe(409);
    // Rejouée : plus rien à écrire, et l'opération n'est plus à faire.
    const again = await simulate(POLICIES);
    await staff().post(`${ROUTE}/${POLICIES}/apply`).send(READ).expect(202);
    await ctx.drain();
    expect(await run(again)).toMatchObject({ state: "succeeded", progress: { writable: 0 } });
    expect((await overview()).operations[0]?.toDo).toBe(false);
  });

  it("refuse une seconde application en cours de la même opération (index partiel)", async () => {
    await pendingPolicy();
    // Une application que conduit une autre instance, encore en cours.
    await ctx.prisma.postDeployRun.create({
      data: {
        id: "postdeploy_ailleurs",
        operationKey: POLICIES,
        state: "running",
        revision: ctx.app.get(AppConfig).revision(),
        simulatedBy: "fiche-autre",
        simulatedAt: new Date(),
        simulationReport: { writable: 1, byHand: 0, summary: [], sample: [] },
        startedAt: new Date(),
      },
    });
    await simulate(POLICIES);

    const response = await staff().post(`${ROUTE}/${POLICIES}/apply`).send(READ);

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("déjà en cours");
  });
});
