/**
 * E2E du **stock décompté** (lot L2 —
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §11.2,
 * §12 bloquant 1, §14).
 *
 * Ce que seul le vrai SQL prouve : que les prélèvements lus par les commandes
 * (`supply = shelf`, jour, point, statut) baissent le reste que la Supervision
 * ET la réception affichent — le même nombre —, qu'une annulation le rend,
 * et que les trois gestes qui baissent un reçu refusent de passer sous le
 * déjà-vendu, sous le verrou consultatif et dans une transaction qui annule
 * l'écriture refusée.
 *
 * Aucune passation n'écrit `shelf` avant le lot L4 : la commande est composée
 * par l'agrégat (`Order.draft`) et écrite par le vrai dépôt
 * (`OrderRepository.place`), comme dans `shelf-order-readers.e2e-spec.ts`.
 */
import type { DayStockOverviewView, ResupplyReceiptView } from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";

import { Order } from "../src/b2b/orders/domain/entities/order.js";
import { OrderCancellationRepository } from "../src/b2b/orders/domain/ports/order-cancellation.repository.js";
import { OrderRepository } from "../src/b2b/orders/domain/ports/order.repository.js";
import { BEFORE_INSCRIPTION } from "../src/b2b/orders/domain/services/cancellation-allowance.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  type E2eContext,
} from "./e2e-harness.js";
import {
  draftOf,
  pieces,
  scene as stockScene,
  type Scene,
  sell as sellLine,
} from "./shelf-stock-scene.js";

function scene(): Promise<Scene> {
  return stockScene(ctx, clock);
}

function sell(s: Scene, quantity: number): Promise<string> {
  return sellLine(ctx, s, pieces(s, quantity));
}

/** Midi aujourd'hui à Paris : « Réceptionner » n'est permis qu'à partir de sa journée. */
function todayAtNoon(): Date {
  return localToInstant(instantToLocal(new Date()).day, "12:00") ?? new Date();
}

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
});

/** Par le vrai dépôt d'annulation, sous son verrou de ligne. */
async function cancel(orderId: string): Promise<void> {
  const repository = ctx.app.get(OrderCancellationRepository);
  await ctx.app.get(UnitOfWork).run(async () => {
    await repository.lock(orderId);
    const crossed = await repository.cancel(
      orderId,
      { cancelledBy: E2E_STAFF_ID, reason: "test", cancelledAt: clock.now() },
      BEFORE_INSCRIPTION,
    );
    expect(crossed).toBe(true);
  });
}

/** Le reste de l'article, lu par la réception ET par la Supervision — qui doivent dire pareil. */
async function remaining(scene: Scene): Promise<number> {
  const agent = ctx.asSub(E2E_STAFF_SUB);
  const receipt = jsonBody<ResupplyReceiptView>(
    await agent.get(`/admin/resupply-receipts/${scene.siteId}/${scene.day}`).expect(200),
  );
  const overview = jsonBody<DayStockOverviewView>(
    await agent.get(`/admin/supervision/stock/${scene.day}`).expect(200),
  );
  const atReception = receipt.stock.find((line) => line.sku === scene.article.sku);
  const atSupervision = overview.sites
    .find((site) => site.siteId === scene.siteId)
    ?.products.find((product) => product.sku === scene.article.sku);
  expect(atReception?.receivedQuantity).toBe(14);
  expect(atSupervision?.stock).toBe(atReception?.estimatedStock);
  return atReception?.estimatedStock ?? Number.NaN;
}

describe("le reste du jour, décompté des commandes sur stock (lot L2)", () => {
  it("baisse d'une commande sur stock, à la réception comme à la Supervision, et remonte à son annulation", async () => {
    const s = await scene();
    expect(await remaining(s)).toBe(14);

    const orderId = await sell(s, 6);
    expect(await remaining(s)).toBe(8);

    await cancel(orderId);
    expect(await remaining(s)).toBe(14);
  });

  it("ne compte pas une commande fabriquée pour ce jour", async () => {
    const s = await scene();
    const order = Order.draft(draftOf(s, pieces(s, 5)), { supply: "planned" });
    order.deferPayment();
    await ctx.app.get(OrderRepository).place(order);

    expect(await remaining(s)).toBe(14);
  });
});

describe("une baisse de reçu sous le déjà-vendu (lot L2)", () => {
  it("est refusée par les trois chemins, et l'écriture refusée n'est pas gardée", async () => {
    const s = await scene();
    await sell(s, 12);
    const agent = ctx.asSub(E2E_STAFF_SUB);
    const sku = s.article.sku;

    const refusals = [
      await agent
        .patch(`/admin/resupply-receipts/${s.siteId}/resupplies/${s.resupplyId}/lines/${sku}`)
        .send({ quantity: 7 }),
      await agent
        .patch(`/admin/resupply-receipts/${s.siteId}/${s.day}/lines/${sku}`)
        .send({ quantity: 1 }),
      await agent.delete(`/admin/resupply-receipts/${s.siteId}/${s.day}/lines/${sku}`),
    ];

    expect(
      refusals.map((response) => [response.status, jsonBody<{ code: string }>(response).code]),
    ).toEqual([
      [409, "resupply.receipt.below_shelf_draws"],
      [409, "resupply.receipt.below_shelf_draws"],
      [409, "resupply.receipt.below_shelf_draws"],
    ]);
    expect(await remaining(s)).toBe(2);
  });

  it("est acceptée jusqu'au déjà-vendu, et le reste tombe à zéro", async () => {
    const s = await scene();
    await sell(s, 12);
    const agent = ctx.asSub(E2E_STAFF_SUB);

    await agent
      .patch(
        `/admin/resupply-receipts/${s.siteId}/resupplies/${s.resupplyId}/lines/${s.article.sku}`,
      )
      .send({ quantity: 8 })
      .expect(204);

    const receipt = jsonBody<ResupplyReceiptView>(
      await agent.get(`/admin/resupply-receipts/${s.siteId}/${s.day}`).expect(200),
    );
    expect(receipt.stock).toEqual([
      {
        sku: s.article.sku,
        label: s.article.name,
        receivedQuantity: 12,
        estimatedStock: 0,
        saleUnit: "piece",
      },
    ]);
  });

  it("laisse retirer le sans commande quand le réassort couvre le déjà-vendu", async () => {
    const s = await scene();
    await sell(s, 10);

    await ctx
      .asSub(E2E_STAFF_SUB)
      .delete(`/admin/resupply-receipts/${s.siteId}/${s.day}/lines/${s.article.sku}`)
      .expect(204);
  });
});
