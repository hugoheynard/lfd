/**
 * **Le fait d'arrêt livré au commerce APRÈS la réouverture** — les vrais
 * abonnés du commerce, rejoués dans l'ordre que la boîte d'envoi ne garantit
 * pas : la remise de la réouverture d'abord, la confirmation de l'arrêt
 * ensuite (`documentation/fournil/plan-historique-des-tirages.md`, § 5).
 */
import type { DurableSubscriber } from "../src/platform/outbox/durable-handler.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { OnProductionDayClosed } from "../src/lafoliecoffee/orders/application/handlers/on-production-day-closed.handler.js";
import { OnProductionDayReopened } from "../src/lafoliecoffee/orders/application/handlers/on-production-day-reopened.handler.js";
import {
  PRODUCTION_DAY_CLOSED,
  PRODUCTION_DAY_REOPENED,
} from "../src/production/channels/commerce/index.js";
import { createUser } from "./factories.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  place,
  relayGate,
  releaseRelay,
} from "./production-day-fixture.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  relayGate.open = true;
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Un objet JSON relu en dictionnaire, sans transtypage. */
function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** Livre à l'abonné le dernier fait de ce type, dans une unité de travail, comme le relais. */
async function deliver(subscriber: DurableSubscriber, type: string): Promise<void> {
  const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
    where: { type },
    orderBy: { occurredAt: "desc" },
  });
  await ctx.app
    .get(UnitOfWork)
    .run(() =>
      subscriber.handle({ eventId: fact.id, type: fact.type, payload: recordOf(fact.payload) }),
    );
}

async function statuses(): Promise<readonly string[]> {
  const orders = await ctx.prisma.order.findMany({
    where: { requestedDeliveryDate: new Date(`${SERVICE_DAY}T00:00:00.000Z`) },
    select: { status: true },
  });
  return orders.map((order) => order.status);
}

describe("le fait d'arrêt livré après la réouverture", () => {
  /**
   * Régression : livré après la remise de la réouverture, le fait d'arrêt
   * confirmait des commandes sur une journée rouverte, et le nouvel arrêt
   * attendait leur remise pour toujours.
   */
  it("ne confirme rien sur la journée rouverte, et le nouvel arrêt passe", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 3 }]);
    // Le relais retenu : aucun fait ne part tout seul, l'ordre est celui du test.
    relayGate.open = false;
    await closePlan(ctx);
    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);

    await deliver(ctx.app.get(OnProductionDayReopened, { strict: false }), PRODUCTION_DAY_REOPENED);
    await deliver(ctx.app.get(OnProductionDayClosed, { strict: false }), PRODUCTION_DAY_CLOSED);

    expect(await statuses()).toEqual(["placed", "placed"]);
    await closePlan(ctx);
    await releaseRelay(ctx);
    expect(await ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(2);
    expect(await statuses()).toEqual(["confirmed", "confirmed"]);
  });
});
