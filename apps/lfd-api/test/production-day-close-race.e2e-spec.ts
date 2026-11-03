/**
 * **L'arrêt du plan en course** — deux transactions sur le vrai Postgres,
 * ordonnées par le verrou de la journée. Mécanique : `day-lock-race.ts` — une
 * troisième transaction tient le verrou le temps de mettre les gestes en
 * file, et Postgres l'accorde dans l'ordre d'attente.
 *
 * Deux régressions :
 *
 * - (2026-11-02, même famille que G-A de l'audit du réassort) la clôture
 *   lisait les commandes du commerce AVANT de prendre le verrou. Une commande
 *   admise entre cette lecture et le verrou n'était pas figée : la journée
 *   s'arrêtait sans elle, et elle manquait au plan du fournil sans qu'aucun
 *   refus ne l'ait dit.
 * - (audit final du réassort, 2026-11-03) l'heure limite n'était contrôlée
 *   que si l'en-tête lu HORS verrou disait « ouverte ». Une réouverture
 *   validée pendant que l'arrêt attendait le verrou lui laissait figer, avant
 *   l'heure, une journée qu'il avait crue déjà arrêtée.
 */
import type { ProductionPlanClosure } from "@lfd/contracts";

import { gate, holdDayLock, untilWaiters } from "./day-lock-race.js";
import { type E2eContext, jsonBody } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  place,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { placeLateByStaff } from "./staff-late-order.js";

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
});

function closeRequest() {
  return ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/close`)
    .then((response) => response);
}

function reopenRequest() {
  return ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/reopen`)
    .then((response) => response);
}

describe("arrêter le plan pendant qu'une commande passe", () => {
  it("la commande admise juste avant l'arrêt est figée dans le plan", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const passation = placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 5 }]);
    await untilWaiters(ctx, 1);
    const closing = closeRequest();
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    const placed = await passation;
    const closed = await closing;
    expect(closed.status).toBe(201);
    const closure = jsonBody<ProductionPlanClosure>(closed);
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: placed.orderNumber },
      select: { id: true },
    });
    const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.day_closed" },
      select: { payload: true },
    });
    expect(closure).toMatchObject({ alreadyClosed: false, absorbed: 2 });
    expect(JSON.stringify(fact.payload)).toContain(order.id);
  });
});

describe("arrêter le plan pendant qu'on le rouvre, avant l'heure limite", () => {
  it("l'arrêt qui avait vu la journée arrêtée est refusé : elle a été rouverte et l'heure n'est pas passée", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 2 }]);
    await closePlan(ctx);
    await ctx.drain();
    // Une saisie de l'équipe reçue « hors plan » après l'arrêt : sous le
    // verrou, l'arrêt a donc de quoi figer — sans elle, l'ancien code
    // tombait sur « journée vide » (la réouverture ne rend les commandes au
    // commerce qu'APRÈS avoir relâché le verrou), et la course ne se voyait pas.
    await placeLateByStaff(ctx, SERVICE_DAY, [{ sku: CROISSANT, quantity: 5 }]);
    // L'heure limite APRÈS l'arrêt : le plan de SERVICE_DAY s'arrête le jour
    // même à 23:59, toujours à venir — un arrêt à la main est désormais trop tôt.
    await ctx
      .asSub(STAFF)
      .put("/admin/order-cutoffs/general")
      .send({ time: "23:59", daysBefore: 0, graceMinutes: 0 })
      .expect(204);
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const reopening = reopenRequest();
    await untilWaiters(ctx, 1);
    // L'arrêt lit l'en-tête (« arrêtée ») hors verrou, puis se met en file
    // DERRIÈRE la réouverture.
    const closing = closeRequest();
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    expect((await reopening).status).toBe(201);
    const closed = await closing;
    expect(closed.status).toBe(409);
    expect(closed.body).toMatchObject({ code: "production.day.before_order_cutoff" });
    const day = await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { closedAt: true },
    });
    expect(day.closedAt).toBeNull();
  });
});
