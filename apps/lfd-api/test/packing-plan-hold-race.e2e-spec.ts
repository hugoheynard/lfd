/**
 * **Le colisage tient le plan arrêté contre la réouverture** — les vrais
 * gestes du poste, deux transactions sur le vrai Postgres, ordonnées par le
 * verrou de la journée.
 *
 * Régression (audit du réassort, 2026-11-02) : un geste du colisage ne prenait
 * aucun verrou commun avec la réouverture. Validé pendant qu'elle tenait le
 * sien, il restait invisible à sa lecture, et le plan était effacé sous un sac
 * ouvert. Désormais chaque geste qui fait « commencer » le colisage tient le
 * verrou en mode partagé au début de sa transaction (`ArrestedPlanHold`).
 *
 * Mécanique : `day-lock-race.ts`.
 */
import { gate, holdDayLock, untilWaiters } from "./day-lock-race.js";
import { createUser } from "./factories.js";
import { type E2eContext, jsonBody } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  MEMBER,
  packingOrderPath,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";

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

/** Une journée arrêtée, sa liste à coliser arrivée ; rend la commande. */
async function arrestedDay(): Promise<string> {
  await place(ctx, issued, [{ sku: "VIE-001-1", quantity: 2 }]);
  await closePlan(ctx);
  await ctx.drain();
  const row = await ctx.prisma.packingOrder.findFirstOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { orderId: true },
  });
  return row.orderId;
}

function reopen() {
  return ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/reopen`)
    .then((response) => response);
}

function openBag(orderId: string) {
  return ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(orderId)}/containers`)
    .send({ nature: "bag" })
    .then((response) => response);
}

describe("le colisage tient le plan arrêté contre la réouverture", () => {
  it("🔴 un sac demandé derrière la réouverture est refusé : le plan a été rouvert", async () => {
    const orderId = await arrestedDay();
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const reopening = reopen();
    await untilWaiters(ctx, 1);
    const opening = openBag(orderId);
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    expect((await reopening).status).toBe(201);
    const refused = await opening;
    expect(refused.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("packing.plan_reopened");
    expect(body.message).toContain("Réarrêtez la journée");
    expect(await ctx.prisma.packingContainer.count({ where: { serviceDay: SERVICE_DAY } })).toBe(0);
  });

  it("un sac qui tient le plan fait attendre la réouverture, qui le voit et refuse", async () => {
    const orderId = await arrestedDay();
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const opening = openBag(orderId);
    await untilWaiters(ctx, 1);
    const reopening = reopen();
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    expect((await opening).status).toBe(201);
    const refused = await reopening;
    expect(refused.status).toBe(409);
    expect(jsonBody<{ message: string }>(refused).message).toContain("colisage");
    const day = await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true },
    });
    expect(day.closedAt).not.toBeNull();
  });
});
