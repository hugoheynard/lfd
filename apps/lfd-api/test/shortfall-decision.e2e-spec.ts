/**
 * **« Décider du départ » — de la fiche commande au bon de livraison et au
 * solde** (lots E6b et E6c1, `documentation/commandes/plan-e6-le-depart-incomplet.md`
 * § 12 à § 14).
 *
 * Ce que seul le vrai Postgres prouve : la décision et la fiche réduite
 * partent dans la même transaction, l'unicité et les CHECK tiennent, le BL
 * suit les quantités décidées, la commande est soldée à la remise, la
 * réouverture de la journée épargne la commande décidée, et le papier
 * imprimé avant la décision est dit à réimprimer.
 */
import type { AdminOrderView, PackingSheet, StaffNote } from "@lfd/contracts";

import { CollectionCandidatesReader } from "../src/b2b/accounting/domain/ports/collection-candidates.reader.js";
import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import { OrderPlanRelease } from "../src/b2b/orders/domain/ports/order-plan-release.js";
import { PackingListWithdrawal } from "../src/packing/domain/ports/packing-list-withdrawal.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { settleCardPayments } from "./card-payments.js";
import {
  handOver,
  pickupSite,
  placeOrder,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";
import {
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  closePlan,
  CROISSANT,
  markLine,
  MEMBER,
  packingOrderPath,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";

const DAY_MS = 86_400_000;

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

interface Drawn extends PlacedTestOrder {
  readonly sheet: PackingSheet;
}

/** Une commande au compte de 3 croissants, tirée au colisage, `packed` au sac. */
async function accountOrder(packed: number): Promise<Drawn> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const placed = await placeOrderForCustomer(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    staffUserId: E2E_STAFF_ID,
    settlement: "account",
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  return drawn(placed, packed);
}

async function drawn(placed: PlacedTestOrder, packed: number): Promise<Drawn> {
  const { orderNumber } = placed;
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, orderNumber);
  if (packed > 0) {
    expect(await bagLines(ctx, sheet, [{ sku: CROISSANT, quantity: packed }])).toBe(204);
  }
  return { ...placed, sheet: await sheetOf(ctx, orderNumber) };
}

async function report(orderId: string): Promise<number> {
  const response = await ctx.asSub(STAFF).post(`${packingOrderPath(orderId)}/shortfall`);
  await ctx.drain();
  return response.status;
}

async function decide(orderId: string): Promise<{ status: number; code: unknown }> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/orders/${orderId}/shortfall-decision`)
    .send({ remainder: "abandoned" });
  await ctx.drain();
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}

async function notesOf(orderId: string): Promise<readonly StaffNote[]> {
  return jsonBody<readonly StaffNote[]>(
    await ctx.asSub(STAFF).get(`/admin/orders/${orderId}/delivery-notes`).expect(200),
  );
}

async function printCarrier(orderId: string, number: string): Promise<void> {
  await ctx
    .asSub(STAFF)
    .get(`/admin/orders/${orderId}/delivery-notes/${number}/carrier.pdf`)
    .expect(200);
}

describe("« Décider du départ » — reste abandonné (E6b + E6c1)", () => {
  it("réduit la fiche, réécrit le BL, ferme le bac, remet un BL partiel et solde la commande", async () => {
    const order = await accountOrder(1);
    expect(await report(order.id)).toBe(204);

    expect((await decide(order.id)).status).toBe(204);

    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.lines.map((line) => line.quantity)).toEqual([1]);
    expect(sheet.canReportShortfall).toBe(false);
    expect(sheet.shortfallReportedAt).toBeNull();
    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${order.id}`).expect(200),
    );
    expect(fiche.shortfall?.decision).toMatchObject({ remainder: "abandoned" });
    const [planned] = await notesOf(order.id);
    expect(planned?.lines.map((line) => line.quantity)).toEqual([1]);

    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "packing.shortfall_cleared" } }),
    ).toBe(0);
    await handOver(ctx, order);

    const [note] = await ctx.prisma.deliveryNote.findMany({ where: { orderId: order.id } });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(note?.status).toBe("handed_over");
    expect(row.billableSubtotalCents).toBe(note?.subtotalCents);
    expect(row.billableTotalCents).toBe(note?.totalCents);
    expect(row.billableTotalCents).toBeLessThan(row.totalCents);
    expect(row.settledOn).toEqual(row.receivedOn);
  });

  it("garde avant E6c2 : décidée et remise, elle n'entre dans aucun lot, et la facture la nomme au lieu de la taire", async () => {
    const order = await accountOrder(1);
    await report(order.id);
    await decide(order.id);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
    const from = new Date(0);
    const to = new Date(Date.parse(`${SERVICE_DAY}T00:00:00.000Z`) + 30 * DAY_MS);

    const candidates = await ctx.app
      .get(CollectionCandidatesReader, { strict: false })
      .collectableOrderIds(from, to);
    const invoicing = await ctx.app
      .get(MonthlyInvoicingReader, { strict: false })
      .uninvoicedOrders(from, to);

    expect(candidates).not.toContain(order.id);
    expect(invoicing.find((one) => one.orderId === order.id)?.shortfallHeld).toBe(true);
  });

  it("une commande sans décision est soldée à la remise par la recopie de ses totaux", async () => {
    const order = await accountOrder(3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.billableTotalCents).toBe(row.totalCents);
    expect(row.billableVatCents).toBe(row.vatCents);
  });

  it("refuse une seconde décision, une commande sans manque, et rien au bac — en 409 nommés", async () => {
    const order = await accountOrder(1);
    expect(await decide(order.id)).toMatchObject({
      status: 409,
      code: "orders.shortfall.nothing_to_decide",
    });
    await report(order.id);
    await decide(order.id);
    expect(await decide(order.id)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.already_decided",
    });
    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(1);
  });

  it("refuse « rien ne part »", async () => {
    const order = await accountOrder(0);
    await report(order.id);
    expect(await decide(order.id)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.nothing_departs",
    });
  });

  it("refuse une commande réglée par carte", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    const order = await drawn(placed, 1);
    await report(order.id);

    expect(await decide(order.id)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.card",
    });
    expect((await sheetOf(ctx, order.orderNumber)).lines.map((line) => line.quantity)).toEqual([3]);
  });

  it("refuse quand le bac a changé depuis le signal, sans rien écrire", async () => {
    const order = await accountOrder(1);
    await report(order.id);
    const bag = (await sheetOf(ctx, order.orderNumber)).containerList?.[0];
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(order.id)}/containers/${bag?.id ?? ""}/lines/${CROISSANT}`)
      .send({ quantity: 1 })
      .expect(204);

    expect(await decide(order.id)).toMatchObject({
      status: 409,
      code: "packing.shortfall.contents_changed",
    });
    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
  });

  it("une décision dont le BL ne se recompose pas n'écrit rien — ni décision, ni fiche, ni signal", async () => {
    const order = await accountOrder(1);
    await report(order.id);
    // Une règle figée illisible, écrite hors de l'application : la composition du BL partiel échoue.
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { discountAdjustment: { mode: "illisible" } },
    });

    expect((await decide(order.id)).status).toBe(500);

    expect(await ctx.prisma.orderShortfallDecision.count()).toBe(0);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.shortfallDecidedAt).toBeNull();
    expect(row.shortfallReportedAt).not.toBeNull();
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.lines.map((line) => line.quantity)).toEqual([3]);
    expect(sheet.shortfallReportedAt).not.toBeNull();
  });

  it("la réouverture épargne la commande décidée et sa fiche, même si le fournil la laissait passer", async () => {
    const order = await accountOrder(1);
    await report(order.id);
    await decide(order.id);
    // Le fournil refuse déjà de rouvrir une journée entamée ; les deux gardes
    // du commerce et du colisage tiennent la course qu'il ne voit pas (plan § 13).
    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(409);
    const { confirmedAt } = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    const released = await ctx.app
      .get(OrderPlanRelease, { strict: false })
      .releaseFromPlan(SERVICE_DAY, [order.id], confirmedAt ?? new Date(0));
    const withdrawn = await ctx.app
      .get(PackingListWithdrawal, { strict: false })
      .withdrawUntouched(SERVICE_DAY, [order.id]);

    expect([released, withdrawn]).toEqual([0, 0]);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "confirmed",
    );
  });

  it("le BL imprimé avant la décision est à réimprimer ; réimprimé, l'avertissement disparaît", async () => {
    const order = await accountOrder(1);
    const [before] = await notesOf(order.id);
    await printCarrier(order.id, before?.number ?? "");
    expect((await notesOf(order.id))[0]?.reprintNeeded).toBe(false);

    await report(order.id);
    await decide(order.id);

    expect((await notesOf(order.id))[0]?.reprintNeeded).toBe(true);
    expect((await sheetOf(ctx, order.orderNumber)).deliveryNoteReprintNeeded).toBe(true);
    await printCarrier(order.id, before?.number ?? "");
    expect((await notesOf(order.id))[0]?.reprintNeeded).toBe(false);
    expect((await sheetOf(ctx, order.orderNumber)).deliveryNoteReprintNeeded).toBe(false);
  });
});
