/**
 * **« Il manque » — du colisage à la commande** (lot E6a,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 3).
 *
 * Ce que seul le vrai Postgres prouve : le fait part avec le geste, l'abonné
 * du commerce pose le manque sur la commande, un second signalement le
 * remplace, la fermeture complète l'efface — et la page Commandes, la fiche
 * et la Supervision le montrent.
 */
import type {
  AdminOrderView,
  AdminOrdersPage,
  DaySupervisionView,
  PackingSheet,
} from "@lfd/contracts";

import type { E2eContext } from "./e2e-harness.js";
import { jsonBody } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import { settleCardPayments } from "./card-payments.js";
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

const DECISION_AWAITED = "packing.shortfall_reported";

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

/** Une commande de 3 croissants, payée, à la liste de colisage, 1 seul au sac. */
async function shortOrder(): Promise<{ readonly id: string; readonly sheet: PackingSheet }> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const placed = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await settleCardPayments(ctx, issued);
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  const drawn = await sheetOf(ctx, placed.orderNumber);
  expect(await bagLines(ctx, drawn, [{ sku: CROISSANT, quantity: 1 }])).toBe(204);
  return { id: placed.id, sheet: await sheetOf(ctx, placed.orderNumber) };
}

async function reportShortfall(orderId: string): Promise<number> {
  const response = await ctx.asSub(STAFF).post(`${packingOrderPath(orderId)}/shortfall`);
  await ctx.drain();
  return response.status;
}

/** Glisse `quantity` croissants de plus dans le premier sac de la commande. */
async function addToBag(sheet: PackingSheet, quantity: number): Promise<void> {
  const bag = sheet.containerList?.[0];
  if (bag === undefined) {
    throw new Error(`La commande ${sheet.reference} devait avoir un sac.`);
  }
  await ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(sheet.orderId)}/containers/${bag.id}/lines/${CROISSANT}`)
    .send({ quantity })
    .expect(204);
}

async function shortfallOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { shortfallReportedAt: true, shortfallLines: true },
  });
}

describe("« Il manque » au colisage → la commande attend une décision", () => {
  it("signaler pose le manque sur la commande, avec les quantités au bac", async () => {
    const { id, sheet } = await shortOrder();
    expect(sheet.canReportShortfall).toBe(true);

    expect(await reportShortfall(sheet.orderId)).toBe(204);

    const order = await shortfallOf(id);
    expect(order.shortfallReportedAt).not.toBeNull();
    expect(order.shortfallLines).toEqual([{ sku: CROISSANT, due: 3, packed: 1 }]);
    const after = await sheetOf(ctx, sheet.reference);
    expect(after.shortfallReportedAt).toBe(order.shortfallReportedAt?.toISOString());
    // La fiche reste ouverte.
    expect(after.packedAt).toBeNull();
  });

  it("resignaler remplace les quantités", async () => {
    const { id, sheet } = await shortOrder();
    await reportShortfall(sheet.orderId);
    const first = (await shortfallOf(id)).shortfallReportedAt;
    await addToBag(sheet, 1);

    expect(await reportShortfall(sheet.orderId)).toBe(204);

    const order = await shortfallOf(id);
    expect(order.shortfallLines).toEqual([{ sku: CROISSANT, due: 3, packed: 2 }]);
    expect(order.shortfallReportedAt?.getTime()).toBeGreaterThan(first?.getTime() ?? 0);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: DECISION_AWAITED } })).toBe(2);
  });

  it("refermer le bac complet efface le manque", async () => {
    const { id, sheet } = await shortOrder();
    await reportShortfall(sheet.orderId);
    await addToBag(sheet, 2);

    expect(await closeOrder(ctx, sheet.orderId)).toBe(204);
    await ctx.drain();

    expect(await shortfallOf(id)).toEqual({ shortfallReportedAt: null, shortfallLines: null });
    expect((await sheetOf(ctx, sheet.reference)).shortfallReportedAt).toBeNull();
  });

  it("refuse un bac complet, en 409", async () => {
    const { sheet } = await shortOrder();
    await addToBag(sheet, 2);
    expect((await sheetOf(ctx, sheet.reference)).canReportShortfall).toBe(false);

    expect(await reportShortfall(sheet.orderId)).toBe(409);
    expect(await ctx.prisma.outboxMessage.count({ where: { type: DECISION_AWAITED } })).toBe(0);
  });

  it("la page Commandes, la fiche et la Supervision montrent « décision attendue »", async () => {
    const { id, sheet } = await shortOrder();
    await reportShortfall(sheet.orderId);
    const reportedAt = (await shortfallOf(id)).shortfallReportedAt?.toISOString();

    const page = jsonBody<AdminOrdersPage>(await ctx.asSub(STAFF).get("/admin/orders").expect(200));
    expect(page.rows.find((row) => row.id === id)?.shortfallReportedAt).toBe(reportedAt);

    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${id}`).expect(200),
    );
    expect(fiche.shortfall).toEqual({
      reportedAt,
      lines: [{ sku: CROISSANT, due: 3, packed: 1 }],
      // Pas encore décidé (E6b).
      decision: null,
    });

    const day = jsonBody<DaySupervisionView>(
      await ctx.asSub(STAFF).get(`/admin/supervision/day?date=${SERVICE_DAY}`).expect(200),
    );
    expect(day.awaitingDecision).toEqual([
      expect.objectContaining({
        orderId: id,
        reference: sheet.reference,
        reportedAt,
        // La carte du colisage dit « Manque : <produit> — 1 sur 3 au bac ».
        lines: [expect.objectContaining({ sku: CROISSANT, due: 3, packed: 1 })],
      }),
    ]);
  });
});
