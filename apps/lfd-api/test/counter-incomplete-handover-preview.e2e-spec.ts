/**
 * E2E de **l'aperçu du départ incomplet au comptoir** (lot C1b, plan
 * `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.1 —
 * Hugo, 2026-11-03) : `GET
 * /admin/counter/orders/:orderId/incomplete-handover`, sous
 * `handover_counter:read`.
 *
 * Ce que seul le vrai Postgres prouve : chaque cas rend son code, lu par les
 * trois blocs sans verrou ni écriture ; un cas éligible rend les lignes qui
 * partent et celles qui ne partent pas, et le geste de C1 écrit ensuite
 * exactement ce que l'aperçu annonçait.
 *
 * Le jour du comptoir est celui de l'horloge : gelée le jour de service de la
 * scène, à midi — laissée à aujourd'hui pour « un autre jour ».
 */
import type { CounterIncompleteHandoverView } from "@lfd/contracts";
import { localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, decide, drawn, report, SCENE_DELIVERY } from "./shortfall-decision-scene.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
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

function openCounterOnServiceDay(): void {
  clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());
}

/** Un vendeur qui ne tient QUE le comptoir. */
async function counterSeller(): Promise<request.Agent> {
  const key = "vendeur-apercu";
  await ctx
    .asSub(STAFF)
    .post("/admin/staff-roles")
    .send({
      key,
      label: key,
      // Une seule ligne par ressource : `write` porte la lecture.
      grants: [{ resource: "handover_counter", action: "write" }],
    })
    .expect(201);
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

function path(orderId: string): string {
  return `/admin/counter/orders/${orderId}/incomplete-handover`;
}

async function preview(
  orderId: string,
  agent: request.Agent = ctx.asSub(STAFF),
): Promise<CounterIncompleteHandoverView> {
  return jsonBody<CounterIncompleteHandoverView>(await agent.get(path(orderId)).expect(200));
}

describe("Aperçu du départ incomplet — chaque cas rend son code", () => {
  it("éligible : le bac, puis le geste écrit exactement ce qui était annoncé — et la lecture n'écrit rien", async () => {
    const order = await accountOrder(ctx, 1);
    const seller = await counterSeller();
    openCounterOnServiceDay();

    const view = await preview(order.id, seller);
    const sheet = await sheetOf(ctx, order.orderNumber);

    expect(view).toEqual({
      orderId: order.id,
      refusal: null,
      handoverRefusalReason: null,
      lines: [
        {
          sku: CROISSANT,
          productName: sheet.lines[0]?.productName,
          saleUnit: "piece",
          due: 3,
          departing: 1,
          notDeparting: 2,
        },
      ],
      decision: null,
    });
    expect(await ctx.prisma.orderShortfall.count()).toBe(0);
    expect(sheet.shortfallReportedAt).toBeNull();

    await seller.post(path(order.id)).send({ remainder: "abandoned" }).expect(204);
    await ctx.drain();
    const decision = await ctx.prisma.orderShortfallDecision.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(decision.departing).toEqual(
      view.lines.map((line) => ({ sku: line.sku, quantity: line.departing })),
    );
    const [note] = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: order.id },
      include: { lines: true },
    });
    expect(note?.lines.map((line) => line.quantity)).toEqual(
      view.lines.map((line) => line.departing),
    );
  });

  it("une livraison : « not_a_pickup », sans lignes", async () => {
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const order = await accountOrder(ctx, 1, [], SCENE_DELIVERY);
    openCounterOnServiceDay();

    expect(await preview(order.id)).toMatchObject({ refusal: "not_a_pickup", lines: [] });
  });

  it("un autre jour : « other_day »", async () => {
    const order = await accountOrder(ctx, 1);

    expect(await preview(order.id)).toMatchObject({ refusal: "other_day", lines: [] });
  });

  it("une carte jamais encaissée : « handover_refused », avec la phrase du retrait", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    openCounterOnServiceDay();

    const view = await preview(placed.id);

    expect(view.refusal).toBe("handover_refused");
    expect(view.handoverRefusalReason).toEqual(expect.any(String));
  });

  it("une carte réglée, tirée : « card », et le bac est montré", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    const order = await drawn(ctx, placed, 1);
    openCounterOnServiceDay();

    const view = await preview(order.id);

    expect(view.refusal).toBe("card");
    expect(view.lines.map((line) => line.departing)).toEqual([1]);
  });

  it("une carte réglée, pas encore au plan : « not_confirmed »", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    openCounterOnServiceDay();

    expect((await preview(placed.id)).refusal).toBe("not_confirmed");
  });

  it("rien au bac : « nothing_departs »", async () => {
    const order = await accountOrder(ctx, 0);
    openCounterOnServiceDay();

    const view = await preview(order.id);

    expect(view.refusal).toBe("nothing_departs");
    expect(view.lines.map((line) => line.departing)).toEqual([0]);
  });

  it("rien ne manque : « nothing_short » — la remise ordinaire suffit", async () => {
    const order = await accountOrder(ctx, 3);
    openCounterOnServiceDay();

    expect(await preview(order.id)).toMatchObject({ refusal: "nothing_short", lines: [] });
  });

  it("décidé par l'équipe Commandes : « already_decided », qui, quand, et les lignes décidées (Hugo, 2026-11-03)", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);
    expect((await decide(ctx, order.id)).status).toBe(204);
    openCounterOnServiceDay();
    const decision = await ctx.prisma.orderShortfallDecision.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const author = await ctx.prisma.staffUser.findFirstOrThrow({ where: { auth0Id: STAFF } });
    const sheet = await sheetOf(ctx, order.orderNumber);

    const view = await preview(order.id, await counterSeller());

    expect(view).toEqual({
      orderId: order.id,
      refusal: "already_decided",
      handoverRefusalReason: null,
      lines: [
        {
          sku: CROISSANT,
          productName: sheet.lines[0]?.productName,
          saleUnit: "piece",
          due: 3,
          departing: 1,
          notDeparting: 2,
        },
      ],
      decision: {
        decidedAt: decision.decidedAt.toISOString(),
        decidedByName: `${author.firstName} ${author.lastName}`.trim(),
      },
    });
    expect(decision.decidedByStaffId).toBe(author.id);
  });

  it("commande inconnue : 404", async () => {
    openCounterOnServiceDay();

    await ctx.asSub(STAFF).get(path("ord_inconnue")).expect(404);
  });
});
