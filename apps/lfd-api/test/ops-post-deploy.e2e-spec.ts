/**
 * E2E des **opérations après déploiement** —
 * `documentation/ops/plan-operations-apres-deploiement.md`, § 5 et § 7.
 *
 * Ce que seul ce niveau prouve : le mur (`ops_post_deploy` lu en base), la
 * simulation qui n'écrit que sa trace, l'application en tâche au nom de qui
 * clique, rejouée sans rien changer, le refus sans simulation, l'ordre entre
 * deux opérations, et l'index unique partiel qui refuse une seconde
 * application en cours.
 *
 * Les opérations éprouvées sont DÉCLARÉES ICI : la liste servie est vide
 * depuis le 2026-11-01 (les deux reprises ont été retirées après une
 * simulation à zéro en production, plan § 8). Le mécanisme ne dépend donc
 * d'aucune reprise réelle.
 */
import type {
  PostDeployOverview,
  PostDeployRunStarted,
  PostDeployRunView,
} from "@lfd/ops-contract";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import {
  POST_DEPLOY_OPERATIONS,
  PostDeployOperation,
  type OperationReport,
  type PostDeployApplication,
} from "../src/platform/post-deploy/post-deploy-operation.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Une reprise de test : un compte de lignes à écrire, et les auteurs des écritures. */
class CountingOperation extends PostDeployOperation {
  readonly title: string;
  readonly why = "Opération de test de l'e2e.";
  readonly limit = "Aucune : opération de test.";
  pending = 0;
  readonly actors: string[] = [];

  constructor(
    readonly key: string,
    readonly after: readonly string[],
  ) {
    super();
    this.title = `Opération ${key}`;
  }

  simulate(): Promise<OperationReport> {
    return Promise.resolve(this.report(this.pending));
  }

  async apply(run: PostDeployApplication): Promise<OperationReport> {
    const written = this.pending;
    this.pending = 0;
    if (written > 0) this.actors.push(run.actor);
    const report = this.report(written);
    await run.progress(report);
    return report;
  }

  private report(writable: number): OperationReport {
    return { writable, byHand: 0, summary: [`${writable} ligne(s)`], sample: [] };
  }
}

const FIRST = "first-test-operation";
const SECOND = "second-test-operation";
const first = new CountingOperation(FIRST, []);
const second = new CountingOperation(SECOND, [FIRST]);

const ROUTE = "/admin/ops/post-deploy";
const READ = { acknowledged: true };

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: POST_DEPLOY_OPERATIONS, value: [first, second] },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  first.pending = 0;
  second.pending = 0;
  first.actors.length = 0;
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** La première opération a des lignes à écrire. */
function pending(): void {
  first.pending = 1;
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
    expect((await commercial.post(`${ROUTE}/${FIRST}/simulate`)).status).toBe(403);
  });
});

describe("la liste", () => {
  it("rien à faire sur une base propre : le bandeau ne s'affiche pas", async () => {
    const list = await overview();

    expect(list.revision).toBe(ctx.app.get(AppConfig).revision());
    expect(list.anyToDo).toBe(false);
    expect(list.operations.map((operation) => operation.key)).toEqual([FIRST, SECOND]);
  });

  it("des lignes à écrire rendent l'opération à faire, et bloquent la suivante", async () => {
    pending();

    const list = await overview();

    expect(list.anyToDo).toBe(true);
    expect(list.operations[0]).toMatchObject({ key: FIRST, toDo: true, lastRun: null });
    expect(list.operations[1]).toMatchObject({ key: SECOND, blockedBy: [FIRST] });
  });
});

describe("simuler puis appliquer", () => {
  it("la simulation n'écrit que sa trace", async () => {
    pending();

    const runId = await simulate(FIRST);

    expect(first.pending).toBe(1);
    expect(await run(runId)).toMatchObject({
      state: "simulated",
      simulatedBy: E2E_STAFF_ID,
      simulation: { writable: 1 },
    });
  });

  it("refuse d'appliquer sans simulation (409, « simulez d'abord »)", async () => {
    pending();

    const response = await staff().post(`${ROUTE}/${FIRST}/apply`).send(READ);

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("Simulez d'abord");
  });

  it("refuse d'appliquer sans « j'ai lu » (400)", async () => {
    pending();
    await simulate(FIRST);

    expect((await staff().post(`${ROUTE}/${FIRST}/apply`).send({})).status).toBe(400);
  });

  it("applique au nom de qui clique, puis se rejoue sans rien changer", async () => {
    pending();
    await simulate(FIRST);

    const runId = jsonBody<PostDeployRunStarted>(
      await staff().post(`${ROUTE}/${FIRST}/apply`).send(READ).expect(202),
    ).runId;
    await ctx.drain();

    expect(await run(runId)).toMatchObject({ state: "succeeded", progress: { writable: 1 } });
    expect(first.actors).toEqual([E2E_STAFF_ID]);

    // Une simulation ne s'applique qu'une fois.
    expect((await staff().post(`${ROUTE}/${FIRST}/apply`).send(READ)).status).toBe(409);
    // Rejouée : plus rien à écrire, et l'opération n'est plus à faire.
    const again = await simulate(FIRST);
    await staff().post(`${ROUTE}/${FIRST}/apply`).send(READ).expect(202);
    await ctx.drain();
    expect(await run(again)).toMatchObject({ state: "succeeded", progress: { writable: 0 } });
    expect((await overview()).operations[0]?.toDo).toBe(false);
  });

  it("refuse une seconde application en cours de la même opération (index partiel)", async () => {
    pending();
    // Une application que conduit une autre instance, encore en cours.
    await ctx.prisma.postDeployRun.create({
      data: {
        id: "postdeploy_ailleurs",
        operationKey: FIRST,
        state: "running",
        revision: ctx.app.get(AppConfig).revision(),
        simulatedBy: "fiche-autre",
        simulatedAt: new Date(),
        simulationReport: { writable: 1, byHand: 0, summary: [], sample: [] },
        startedAt: new Date(),
      },
    });
    await simulate(FIRST);

    const response = await staff().post(`${ROUTE}/${FIRST}/apply`).send(READ);

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain("déjà en cours");
  });
});
