/**
 * E2E de l'**impression provisoire du dossier** (plan
 * `documentation/fournil/plan-impression-provisoire.md`, lot P2) : avant
 * l'arrêt, la fenêtre lit les commandes en direct, un tirage prend le numéro
 * suivant de la journée et range son PDF, « depuis #N » ne retire que ce qui a
 * bougé, et l'arrêt ferme la porte en nommant le dossier figé.
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { DOSSIER_PARTS } from "../src/production/plan/domain/services/day-dossier-selection.js";
import type { ProductionPrintOptionsView } from "../src/production/plan/application/queries/get-print-options.query.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
} from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const BASE = `/admin/production/batch/${SERVICE_DAY}`;
const ALL = { parts: [...DOSSIER_PARTS], groups: "all", orders: { kind: "all" } } as const;

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

async function options(): Promise<ProductionPrintOptionsView> {
  const response = await ctx.asSub(STAFF).get(`${BASE}/print-options`).expect(200);
  return jsonBody<ProductionPrintOptionsView>(response);
}

async function draw(body: object, key: string = randomUUID(), status = 201): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post(`${BASE}/provisional-print`)
    .set("Idempotency-Key", key)
    .send(body)
    .expect(status);
  return status === 201 ? jsonBody<{ id: string }>(response).id : "";
}

async function pdfOf(id: string): Promise<readonly string[]> {
  const response = await ctx
    .asSub(STAFF)
    .get(`${BASE}/provisional-print/${id}.pdf`)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200)
    .expect("Content-Type", /application\/pdf/u);
  return Buffer.isBuffer(response.body) ? pdfPages(response.body) : [];
}

describe("l'impression provisoire du dossier", () => {
  it("tire, numérote, range, et dit quand la journée a changé", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    const before = await options();
    expect(before).toMatchObject({ arrested: false, prints: [], changedSinceLast: false });
    expect(before.orders).toHaveLength(1);

    const first = await draw(ALL);
    const pages = await pdfOf(first);
    expect(pages[0]).toContain(
      `Provisoire ${SERVICE_DAY.slice(8, 10)}/${SERVICE_DAY.slice(5, 7)} #1`,
    );
    expect(pages.join("\n")).toContain("plan non arrêté");

    const after = await options();
    expect(after.prints.map((print) => [print.id, print.run])).toEqual([[first, 1]]);
    expect(after.changedSinceLast).toBe(false);

    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    expect((await options()).changedSinceLast).toBe(true);

    const second = await draw({ ...ALL, orders: { kind: "since", run: 1 } });
    const rows = await ctx.prisma.productionProvisionalPrint.findMany({ orderBy: { run: "asc" } });
    expect(rows.map((row) => [row.id, row.run])).toEqual([
      [first, 1],
      [second, 2],
    ]);
    const latest = (await options()).orders.at(-1)?.orderId;
    expect(Object.keys(rows[1]?.orderFingerprints ?? {})).toEqual([latest]);
  });

  it("un rejeu de la même intention rend le même tirage, sans second numéro", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    const key = randomUUID();
    const id = await draw(ALL, key);
    await expect(draw(ALL, key)).resolves.toBe(id);
    expect(await ctx.prisma.productionProvisionalPrint.count()).toBe(1);
  });

  it("refuse (409) une fois le plan arrêté, en nommant le dossier figé", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    const response = await ctx
      .asSub(STAFF)
      .post(`${BASE}/provisional-print`)
      .set("Idempotency-Key", randomUUID())
      .send(ALL)
      .expect(409);
    expect(JSON.stringify(response.body)).toContain("dossier figé");
    // Arrêtée, la fenêtre lit le dossier figé, et ne dit plus « la journée a changé ».
    const arrested = await options();
    expect(arrested).toMatchObject({ arrested: true, changedSinceLast: false });
    expect(arrested.orders).toHaveLength(1);
    expect(arrested.groups.length).toBeGreaterThan(0);
  });

  it("refuse (400) une sélection sans partie, et (404) une impression inconnue", async () => {
    await draw({ ...ALL, parts: [] }, randomUUID(), 400);
    await ctx.asSub(STAFF).get(`${BASE}/provisional-print/inconnue.pdf`).expect(404);
  });

  it("le balayage nocturne garde les impressions du jour, et exige son jeton", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await draw(ALL);
    await ctx.http().post("/admin/production/provisional-prints/sweep").expect(401);
    const response = await ctx
      .http()
      .post("/admin/production/provisional-prints/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(jsonBody<{ pruned: number }>(response)).toEqual({ pruned: 0 });
    expect(await ctx.prisma.productionProvisionalPrint.count()).toBe(1);
  });
});
