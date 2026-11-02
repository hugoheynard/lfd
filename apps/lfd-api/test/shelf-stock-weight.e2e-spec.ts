/**
 * E2E du **stock au poids** (lot L2b-1 —
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §14 ;
 * Hugo, 2026-11-02 : « un article au poids doit avoir un stock au poids »).
 *
 * Ce que seul le vrai SQL prouve : que l'unité figée sur la ligne de reçu
 * (`resupply_receipt_line.sale_unit`) et celle des lignes de commande
 * (`order_lines.sale_unit`) se décomptent en grammes, à part des pièces, à la
 * réception comme à la Supervision ; que la baisse sous le déjà-vendu se
 * refuse en disant le poids ; et qu'une demande au poids part au fournil en
 * grammes depuis que la garde d'envoi de L2b-1 est retirée (lot L2b-3 — le
 * parcours entier est dans `resupply-village-flow.e2e-spec.ts`).
 */
import type {
  DayStockOverviewView,
  ResupplyArticleView,
  ResupplyReceiptView,
} from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";

import { WEIGHED_GRAVLAX } from "../src/dev/seeding/delivery-day.seed.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { pieces, scene, type Scene, sell } from "./shelf-stock-scene.js";
import { counterSends } from "./site-resupply-scene.js";
import { seedWeighedArticles } from "./weighed-catalog-scene.js";

/** Midi aujourd'hui à Paris : la saisie sans commande vaut pour sa journée. */
function todayAtNoon(): Date {
  return localToInstant(instantToLocal(new Date()).day, "12:00") ?? new Date();
}

/** Le saumon gravlax du corpus, vendu au poids (`weighed-catalog-scene.ts`). */
const GRAVLAX = { sku: `${WEIGHED_GRAVLAX}-1`, name: "Saumon gravlax maison" } as const;
const RECEIVED_GRAMS = 5_000;
const SOLD_GRAMS = 1_250;

const clock = new FixedClock(todayAtNoon());
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: Clock, value: clock }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(todayAtNoon());
  await seedWeighedArticles(ctx);
});

/** La scène du stock (14 pièces reçues), plus 5 kg de gravlax reçus sans commande. */
async function weighedScene(): Promise<Scene> {
  const s = await scene(ctx, clock);
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post(`/admin/resupply-receipts/${s.siteId}/${s.day}/lines`)
    .send({ sku: GRAVLAX.sku, quantity: RECEIVED_GRAMS })
    .expect(204);
  return s;
}

function sellGravlax(s: Scene, grams: number): Promise<string> {
  return sell(ctx, s, {
    sku: GRAVLAX.sku,
    productName: GRAVLAX.name,
    saleUnit: "weight",
    quantity: grams,
  });
}

/** Le stock du point, lu à la réception ET à la Supervision. */
async function stockOf(s: Scene) {
  const agent = ctx.asSub(E2E_STAFF_SUB);
  const receipt = jsonBody<ResupplyReceiptView>(
    await agent.get(`/admin/resupply-receipts/${s.siteId}/${s.day}`).expect(200),
  );
  const overview = jsonBody<DayStockOverviewView>(
    await agent.get(`/admin/supervision/stock/${s.day}`).expect(200),
  );
  const products = overview.sites.find((site) => site.siteId === s.siteId)?.products ?? [];
  return { atReception: receipt.stock, atSupervision: products };
}

describe("le reste du jour au poids (lot L2b-1)", () => {
  it("5 kg reçus − 1,25 kg pris sur stock = 3,75 kg ; la pièce n'est pas touchée", async () => {
    const s = await weighedScene();
    await sellGravlax(s, SOLD_GRAMS);
    await sell(ctx, s, pieces(s, 6));

    const { atReception, atSupervision } = await stockOf(s);

    expect(atReception).toEqual([
      {
        sku: s.article.sku,
        label: s.article.name,
        receivedQuantity: 14,
        estimatedStock: 8,
        saleUnit: "piece",
      },
      {
        sku: GRAVLAX.sku,
        label: GRAVLAX.name,
        receivedQuantity: RECEIVED_GRAMS,
        estimatedStock: RECEIVED_GRAMS - SOLD_GRAMS,
        saleUnit: "weight",
      },
    ]);
    expect(atSupervision.find((product) => product.sku === GRAVLAX.sku)).toMatchObject({
      stock: RECEIVED_GRAMS - SOLD_GRAMS,
      saleUnit: "weight",
    });
    expect(atSupervision.find((product) => product.sku === s.article.sku)).toMatchObject({
      stock: 8,
      saleUnit: "piece",
    });
  });

  it("refuse de baisser le reçu sous le déjà-vendu, en disant le poids, et ne garde rien", async () => {
    const s = await weighedScene();
    await sellGravlax(s, SOLD_GRAMS);

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .patch(`/admin/resupply-receipts/${s.siteId}/${s.day}/lines/${GRAVLAX.sku}`)
      .send({ quantity: 1_000 });

    expect(refused.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("resupply.receipt.below_shelf_draws");
    expect(body.message).toContain("1,25 kg « Saumon gravlax maison » déjà vendus");
    const { atReception } = await stockOf(s);
    expect(atReception.find((line) => line.sku === GRAVLAX.sku)?.receivedQuantity).toBe(
      RECEIVED_GRAMS,
    );
  });
});

describe("une demande au poids et le fournil (lots L2b-1, L2b-3)", () => {
  it("se compose en grammes et part au fournil, son unité figée", async () => {
    const s = await scene(ctx, clock);

    const { sent } = await counterSends(ctx.asSub(E2E_STAFF_SUB), s.siteId, "asap", [
      { sku: GRAVLAX.sku, quantity: 750 },
    ]);

    expect(sent.status).toBe(204);
    const lines = await ctx.prisma.siteResupplyLine.findMany({
      where: { sku: GRAVLAX.sku },
      select: { quantity: true, saleUnit: true, resupply: { select: { placedAt: true } } },
    });
    expect(lines.map((line) => [line.quantity, line.saleUnit])).toEqual([[750, "weight"]]);
    expect(lines[0]?.resupply.placedAt).not.toBeNull();
  });
});

describe("la liste d'articles des écrans de réassort (lot L2b-4)", () => {
  it("propose un article au poids, avec son unité, à côté des pièces", async () => {
    await scene(ctx, clock);

    const articles = jsonBody<readonly ResupplyArticleView[]>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/resupply-receipts/articles").expect(200),
    );

    expect(articles.find((article) => article.sku === GRAVLAX.sku)?.saleUnit).toBe("weight");
    expect(articles.some((article) => article.saleUnit === "piece")).toBe(true);
  });
});
