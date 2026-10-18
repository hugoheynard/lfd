/**
 * E2E des **compteurs d'audience anonymes** (R0 du plan de recommandation) :
 * un lot de gestes sans jeton → des compteurs agrégés par (jour, sku,
 * événement, emplacement, source), relus par le staff.
 *
 * Ce qu'aucun test unitaire ne prouve : l'incrément `ON CONFLICT` sous
 * concurrence, les CHECK de la table, et le corps `text/plain` d'un
 * `sendBeacon`.
 */
import { instantToLocal, type ProductAudienceCounterView } from "@lfd/contracts";
import request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

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

/** Sans jeton : la boutique compte ce que regarde un visiteur sans compte. */
function send(body: unknown): request.Test {
  return request(ctx.app.getHttpServer())
    .post("/shop/audience")
    .send(body as object);
}

/** Le jour métier tel que le serveur le lit — jamais une date écrite en dur. */
function today(): string {
  return instantToLocal(ctx.app.get(Clock).now()).day;
}

async function counters(): Promise<readonly ProductAudienceCounterView[]> {
  const day = today();
  const response = await ctx
    .http()
    .set("Authorization", "Bearer staff-e2e")
    .get(`/admin/product-audience?from=${day}&to=${day}`)
    .expect(200);
  return response.body as ProductAudienceCounterView[];
}

describe("les compteurs d'audience", () => {
  it("agrège un lot de gestes par article, geste, emplacement et source, sur le jour métier", async () => {
    await send({
      events: [
        { sku: "VIE-001", event: "product_viewed" },
        { sku: "VIE-001", event: "product_viewed" },
        { sku: "VIE-001", event: "added_to_cart" },
        { sku: "VIE-002", event: "suggestion_shown", placement: "cart", source: "data" },
        { sku: "VIE-002", event: "suggestion_shown", placement: "cart", source: "staff" },
        { sku: "VIE-002", event: "suggestion_shown", placement: "cart", source: "staff" },
      ],
    }).expect(204);
    await send({ events: [{ sku: "VIE-001", event: "product_viewed" }] }).expect(204);

    const day = today();
    expect(await counters()).toEqual([
      { day, sku: "VIE-001", event: "added_to_cart", placement: "none", source: "none", count: 1 },
      { day, sku: "VIE-001", event: "product_viewed", placement: "none", source: "none", count: 3 },
      {
        day,
        sku: "VIE-002",
        event: "suggestion_shown",
        placement: "cart",
        source: "data",
        count: 1,
      },
      {
        day,
        sku: "VIE-002",
        event: "suggestion_shown",
        placement: "cart",
        source: "staff",
        count: 2,
      },
    ]);
  });

  it("lit le corps texte d'un sendBeacon", async () => {
    await request(ctx.app.getHttpServer())
      .post("/shop/audience")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ events: [{ sku: "VIE-001", event: "product_viewed" }] }))
      .expect(204);

    expect((await counters()).map((row) => row.count)).toEqual([1]);
  });

  it("refuse un lot qui porte un SKU inconnu du catalogue, sans rien compter", async () => {
    const response = await send({
      events: [
        { sku: "VIE-001", event: "product_viewed" },
        { sku: "GHOST-999", event: "product_viewed" },
      ],
    });

    expect(response.status).toBe(400);
    expect(await counters()).toEqual([]);
  });

  it("refuse un lot trop gros, sans rien compter", async () => {
    const events = Array.from({ length: 51 }, () => ({ sku: "VIE-001", event: "product_viewed" }));

    expect((await send({ events })).status).toBe(400);
    expect(await counters()).toEqual([]);
  });

  it("refuse une suggestion sans source, sans rien compter", async () => {
    const response = await send({
      events: [{ sku: "VIE-002", event: "suggestion_shown", placement: "cart" }],
    });

    expect(response.status).toBe(400);
    expect(await counters()).toEqual([]);
  });

  it("refuse un geste hors de l'énumération", async () => {
    expect((await send({ events: [{ sku: "VIE-001", event: "order_placed" }] })).status).toBe(400);
  });

  it("ne perd aucun incrément quand des lots arrivent en même temps", async () => {
    const parallel = 10;
    const statuses = await Promise.all(
      Array.from({ length: parallel }, () =>
        send({
          events: [
            { sku: "VIE-001", event: "product_viewed" },
            { sku: "VIE-001", event: "product_viewed" },
          ],
        }).then((response) => response.status),
      ),
    );

    expect(statuses.every((status) => status === 204)).toBe(true);
    expect(statuses).toHaveLength(parallel);
    expect((await counters()).map((row) => row.count)).toEqual([parallel * 2]);
  });

  it("garde la lecture des compteurs derrière le mur staff", async () => {
    const day = today();
    expect((await ctx.http().get(`/admin/product-audience?from=${day}&to=${day}`)).status).toBe(
      401,
    );
  });
});
