/**
 * E2E du **départ incomplet décidé au comptoir** (lot C1, plan
 * `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §4.2 et
 * §4.3 — Hugo, 2026-11-03) : `POST
 * /admin/counter/orders/:orderId/incomplete-handover`, sous
 * `handover_counter:write`.
 *
 * Ce que seul le vrai Postgres prouve : la fiche, le signal, la décision, le
 * BL et l'attestation partent dans UNE transaction — ou rien ; le BL remis
 * et le solde suivent ce qui était au bac ; un refus du retrait, de la
 * décision ou du colisage n'écrit rien ; un « Il manque » du poste en vol
 * arrive sur une décision prise, sans effet.
 *
 * Le jour du comptoir est celui de l'horloge : elle est gelée le jour de
 * service de la scène, à midi, au moment du geste — et laissée à aujourd'hui
 * pour éprouver « un autre jour ».
 */
import { localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  MEMBER,
  packingOrderPath,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import {
  accountOrder,
  drawn,
  report,
  SCENE_DELIVERY,
  type Drawn,
} from "./shortfall-decision-scene.js";

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

/** Le comptoir ouvre : midi, le jour de service de la scène, à Paris. */
function openCounterOnServiceDay(): void {
  clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());
}

/** Un membre du staff qui ne tient QUE le comptoir — le vendeur. */
async function counterSeller(): Promise<{ readonly agent: request.Agent; readonly id: string }> {
  const key = "vendeur-comptoir";
  await ctx
    .asSub(STAFF)
    .post("/admin/staff-roles")
    .send({ key, label: key, grants: [{ resource: "handover_counter", action: "write" }] })
    .expect(201);
  const sub = `staff-${key}`;
  const seller = await ctx.prisma.staffUser.create({
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
  return { agent: ctx.asSub(sub), id: seller.id };
}

async function handOverPacked(
  agent: request.Agent,
  orderId: string,
): Promise<{ readonly status: number; readonly code: unknown }> {
  const response = await agent
    .post(`/admin/counter/orders/${orderId}/incomplete-handover`)
    .send({ remainder: "abandoned" });
  await ctx.drain();
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}

/** Rien n'est écrit : ni signal, ni décision, ni BL réécrit, ni retrait, ni bac marqué. */
async function expectNothingWritten(order: Drawn): Promise<void> {
  const shortfall = await ctx.prisma.orderShortfall.findFirst({ where: { orderId: order.id } });
  expect(shortfall?.reportedAt ?? null).toBeNull();
  expect(await ctx.prisma.orderShortfallDecision.count({ where: { orderId: order.id } })).toBe(0);
  expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(0);
  const notes = await ctx.prisma.deliveryNote.findMany({
    where: { orderId: order.id },
    include: { lines: true },
  });
  for (const note of notes) {
    expect(note.status).not.toBe("handed_over");
    expect(note.lines.map((line) => line.quantity)).toEqual([3]);
  }
  const sheet = await sheetOf(ctx, order.orderNumber);
  expect(sheet.shortfallReportedAt).toBeNull();
  expect(sheet.lines.map((line) => line.quantity)).toEqual([3]);
}

describe("Départ incomplet au comptoir — ce qui est au bac part, le reste est abandonné", () => {
  it("décide, réécrit le BL, remet, et solde la commande sur le livré", async () => {
    const order = await accountOrder(ctx, 1);
    const seller = await counterSeller();
    openCounterOnServiceDay();

    expect(await handOverPacked(seller.agent, order.id)).toEqual({ status: 204, code: null });

    const decision = await ctx.prisma.orderShortfallDecision.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(decision).toMatchObject({ decidedByStaffId: seller.id, remainder: "abandoned" });
    const handover = await ctx.prisma.orderHandover.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(handover).toMatchObject({ handedOverBy: seller.id, handedOverVia: "manual" });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("fulfilled");
    const [note] = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: order.id },
      include: { lines: true },
    });
    expect(note?.status).toBe("handed_over");
    expect(note?.lines.map((line) => line.quantity)).toEqual([1]);
    expect(row.billableTotalCents).toBe(note?.totalCents);
    expect(row.billableTotalCents).toBeLessThan(row.totalCents);
    // Le poste n'a rien publié : le commerce a écrit le signal lui-même.
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "packing.shortfall_reported" } }),
    ).toBe(0);
    // La fiche : réduite au bac, marque levée — puis fermée telle quelle par
    // le fait de la remise (2026-11-03, option b) : elle n'attend plus rien.
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.lines.map((line) => line.quantity)).toEqual([1]);
    expect(sheet.shortfallReportedAt).toBeNull();
    expect(sheet.packedAt).not.toBeNull();
    expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(0);
  });

  it("refuse une livraison, en 403 nommé, sans rien écrire", async () => {
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const order = await accountOrder(ctx, 1, [], SCENE_DELIVERY);
    const seller = await counterSeller();
    openCounterOnServiceDay();

    expect(await handOverPacked(seller.agent, order.id)).toEqual({
      status: 403,
      code: "handover.counter.out_of_reach",
    });
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.shortfallReportedAt).toBeNull();
    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
  });

  it("refuse un retrait d'un autre jour, en 403 nommé, sans rien écrire", async () => {
    const order = await accountOrder(ctx, 1);
    const seller = await counterSeller();

    expect(await handOverPacked(seller.agent, order.id)).toEqual({
      status: 403,
      code: "handover.counter.out_of_reach",
    });
    await expectNothingWritten(order);
  });

  it("une remise refusée (non réglée) n'écrit RIEN — et passe avant le refus « carte »", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    // Une carte jamais encaissée : le plan ne la prend pas, elle n'est pas tirée.
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    openCounterOnServiceDay();

    expect(await handOverPacked(ctx.asSub(STAFF), placed.id)).toEqual({
      status: 409,
      code: "handover.refused",
    });
    expect(await ctx.prisma.orderShortfall.count()).toBe(0);
    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
    expect(await ctx.prisma.orderHandover.count()).toBe(0);
  });

  it("refuse une commande par carte, réglée, sans rien écrire", async () => {
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

    expect(await handOverPacked(ctx.asSub(STAFF), order.id)).toEqual({
      status: 409,
      code: "orders.shortfall_decision.card",
    });
    await expectNothingWritten(order);
  });

  it("refuse rien au bac, sans rien écrire", async () => {
    const order = await accountOrder(ctx, 0);
    openCounterOnServiceDay();

    expect(await handOverPacked(ctx.asSub(STAFF), order.id)).toEqual({
      status: 409,
      code: "orders.shortfall_decision.nothing_departs",
    });
    await expectNothingWritten(order);
  });

  it("refuse un bac où rien ne manque — la remise ordinaire suffit", async () => {
    const order = await accountOrder(ctx, 3);
    openCounterOnServiceDay();

    expect(await handOverPacked(ctx.asSub(STAFF), order.id)).toEqual({
      status: 409,
      code: "packing.shortfall.nothing_short",
    });
    expect(await ctx.prisma.orderHandover.count()).toBe(0);
  });

  it("refuse une commande pas encore confirmée au plan", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    openCounterOnServiceDay();

    expect(await handOverPacked(ctx.asSub(STAFF), placed.id)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.not_confirmed",
    });
    expect(await ctx.prisma.orderHandover.count()).toBe(0);
  });

  it("« Il manque » pressé au poste juste avant : la décision reprend le bac, le fait en vol est sans effet", async () => {
    const order = await accountOrder(ctx, 1);
    openCounterOnServiceDay();
    // Le poste signale, et son fait n'est pas encore livré au commerce.
    expect((await ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/shortfall`)).status).toBe(
      204,
    );

    expect(await handOverPacked(ctx.asSub(STAFF), order.id)).toEqual({ status: 204, code: null });

    const decision = await ctx.prisma.orderShortfallDecision.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(decision.departing).toEqual([{ sku: CROISSANT, quantity: 1 }]);
    expect(await ctx.prisma.orderHandover.count({ where: { orderId: order.id } })).toBe(1);
    expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(0);
  });

  it("le signal déjà reçu du poste est repris, pas refusé", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);
    openCounterOnServiceDay();

    expect(await handOverPacked(ctx.asSub(STAFF), order.id)).toEqual({ status: 204, code: null });
    expect(await ctx.prisma.orderShortfallDecision.count({ where: { orderId: order.id } })).toBe(1);
  });
});
