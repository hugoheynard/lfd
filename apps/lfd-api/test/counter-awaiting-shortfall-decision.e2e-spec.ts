/**
 * E2E de **« le superviseur décide, le comptoir attend »** (D7 et D8 du plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`).
 *
 * Ce que seul le vrai Postgres prouve : le commerce sert au retrait un sujet
 * qui dit « décision attendue » (la ligne du manque, lue par le commerce et
 * aucun autre), le scan et la saisie le refusent sans rien écrire, la file le
 * dit, la décision le lève ; le départ incomplet est sous le droit de la
 * décision ; la cloche part une fois, chez qui décide.
 */
import { localToInstant, type HandoverQueueView } from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";

const REFUSAL = "Il manque des produits : la décision du superviseur est attendue.";

const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    ADMIN_VERIFIER_OVERRIDE,
    { token: Clock, value: clock },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
});

/** Une personne qui tient le rôle créé à l'écran des rôles avec ces droits. */
async function staffWith(
  key: string,
  grants: readonly { readonly resource: string; readonly action: "read" | "write" }[],
): Promise<request.Agent> {
  await ctx.asSub(STAFF).post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

/** Une commande de 3 croissants, 1 au sac, et le manque signalé au poste. */
async function awaitingDecision(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  return order;
}

async function tokenOf(orderId: string): Promise<string> {
  const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { handoverToken: true },
  });
  if (handoverToken === null) {
    throw new Error(`La commande ${orderId} n'a pas de jeton de retrait : la scène est fausse.`);
  }
  return handoverToken;
}

function messageOf(response: request.Response): unknown {
  const body: unknown = response.body;
  return typeof body === "object" && body !== null && "message" in body ? body.message : null;
}

describe("La remise normale au comptoir attend la décision (D7)", () => {
  it("refuse le scan et la saisie sans rien écrire, puis remet une fois la décision prise", async () => {
    const order = await awaitingDecision();
    const staff = ctx.asSub(STAFF);

    const scanned = await staff.post(`/admin/handover/${await tokenOf(order.id)}`).send({});
    const seized = await staff.post(`/admin/handover/manual/${order.orderNumber}`).send({});

    for (const response of [scanned, seized]) {
      expect(response.status).toBe(409);
      expect(messageOf(response)).toBe(REFUSAL);
    }
    expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(0);

    expect((await decide(ctx, order.id)).status).toBe(204);
    await staff.post(`/admin/handover/manual/${order.orderNumber}`).send({}).expect(201);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("la vue du scan dit le refus avant le geste, et la file dit « décision attendue »", async () => {
    const order = await awaitingDecision();
    const staff = ctx.asSub(STAFF);

    const view = await staff.get(`/admin/handover/${await tokenOf(order.id)}`).expect(200);
    expect(jsonBody<{ blockedReason: string | null }>(view).blockedReason).toBe(REFUSAL);
    const queue = jsonBody<HandoverQueueView>(
      await staff.get(`/admin/handover/file?jour=${SERVICE_DAY}`).expect(200),
    );
    expect(queue.entries.map((entry) => entry.awaitingShortfallDecision)).toEqual([true]);

    expect((await decide(ctx, order.id)).status).toBe(204);
    const after = jsonBody<HandoverQueueView>(
      await staff.get(`/admin/handover/file?jour=${SERVICE_DAY}`).expect(200),
    );
    expect(after.entries.map((entry) => entry.awaitingShortfallDecision)).toEqual([false]);
  });
});

describe("Le départ incomplet au comptoir est sous le droit du superviseur (D7)", () => {
  it("403 au vendeur qui ne tient que le comptoir, sans rien écrire ; l'aperçu lui reste ouvert", async () => {
    const order = await awaitingDecision();
    const seller = await staffWith("vendeur", [{ resource: "handover_counter", action: "write" }]);
    clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());

    await seller.get(`/admin/counter/orders/${order.id}/incomplete-handover`).expect(200);
    await seller
      .post(`/admin/counter/orders/${order.id}/incomplete-handover`)
      .send({ remainder: "abandoned" })
      .expect(403);
    await ctx.drain();

    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
    expect(await ctx.prisma.orderHandover.count()).toBe(0);
  });

  it("accepté avec `b2b_orders_shortfall:write` : la décision part, et la commande avec", async () => {
    const order = await awaitingDecision();
    const supervisor = await staffWith("superviseur", [
      { resource: "handover_counter", action: "write" },
      { resource: "b2b_orders_shortfall", action: "write" },
    ]);
    clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());

    await supervisor
      .post(`/admin/counter/orders/${order.id}/incomplete-handover`)
      .send({ remainder: "abandoned" })
      .expect(204);
    await ctx.drain();

    expect(await ctx.prisma.orderShortfallDecision.count({ where: { orderId: order.id } })).toBe(1);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(1);
  });
});

describe("La cloche de qui décide (D8)", () => {
  it("sonne une fois par signalement, chez `b2b_orders_shortfall:write`, vers la commande", async () => {
    const order = await awaitingDecision();
    await ctx.drain();

    const bells = await ctx.prisma.staffNotification.findMany({
      where: { kind: "order.shortfall_reported" },
    });
    expect(bells).toHaveLength(1);
    expect(bells[0]).toMatchObject({
      audience: "b2b_orders_shortfall:write",
      link: `/commandes/${order.id}`,
      subject: `Manque signalé — ${order.orderNumber}`,
    });
  });
});
