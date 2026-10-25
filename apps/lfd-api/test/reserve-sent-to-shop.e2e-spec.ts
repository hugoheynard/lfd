/**
 * **Envoyer en boutique le pain rendu** (plan A1, lot A1.4 —
 * `documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md`).
 *
 * Ce que seul le vrai Postgres prouve : la sortie de réserve et le réassort
 * `reserve` écrits dans la même transaction — ou rien, quand le libre manque
 * ; le compte du four intact ; aucun réassort proposé au fournil ; la
 * réception au comptoir sans lancement ; le droit `production_resupply:write`.
 */
import {
  localToInstant,
  type ResupplyProductionDayView,
  type ResupplyReceiptView,
} from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";

import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { pickupSite } from "./order-factory.js";
import {
  bagLines,
  closePlan,
  CROISSANT,
  markLine,
  relayGate,
  SERVICE_DAY,
  sheetOf,
} from "./production-day-fixture.js";
import {
  bootAfterPlanScene,
  croissantStock,
  personalPickup,
  setStage,
  staffCancel,
} from "./order-cancel-after-plan-scene.js";

let ctx: E2eContext;
let issued: string[];
/**
 * L'horloge suit le mur jusqu'à l'annulation, puis se pose au matin de la
 * journée servie : seule la réserve DU JOUR sort en boutique, et la journée
 * de la scène est dans une semaine.
 */
const clock = new FixedClock(new Date());

beforeAll(async () => {
  ({ ctx, issued } = await bootAfterPlanScene([{ token: Clock, value: clock }]));
});

/** Le matin de la journée servie, à Paris. */
function morningOfServiceDay(): Date {
  const instant = localToInstant(SERVICE_DAY, "07:00");
  if (instant === null) {
    throw new Error(`Aucun 07:00 à Paris le ${SERVICE_DAY}.`);
  }
  return instant;
}

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  clock.set(new Date());
  relayGate.open = true;
  await ctx.reset();
});

/** Une commande de retrait inscrite, trois pièces au sac, puis annulée : rendues à la réserve. */
async function returnedByCancellation(): Promise<void> {
  await setStage(ctx, "ready");
  const order = await personalPickup(ctx, issued, 3);
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  expect(await bagLines(ctx, await sheetOf(ctx, order.reference))).toBe(204);
  await staffCancel(ctx, order.id).expect(204);
  await ctx.drain();
  clock.set(morningOfServiceDay());
}

function sendToShop(
  agent: request.Agent,
  body: { siteId: string; key: string; lines: { sku: string; quantity: number }[] },
): request.Test {
  return agent.post(`/admin/reserve-shop-releases/${SERVICE_DAY}`).send(body);
}

const ovenCount = () =>
  ctx.prisma.productionCount.findMany({
    where: { serviceDay: SERVICE_DAY },
    orderBy: { sku: "asc" },
  });

/** La journée du réassort `reserve` : celle du geste, « au plus tôt ». */
async function dayOf(resupplyId: string): Promise<string> {
  const row = await ctx.prisma.siteResupply.findUniqueOrThrow({
    where: { id: resupplyId },
    select: { serviceDay: true },
  });
  return row.serviceDay.toISOString().slice(0, 10);
}

describe("envoyer en boutique depuis la réserve", () => {
  it("la réserve baisse, le four ne bouge pas, et un réassort `reserve` naît envoyé", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);
    const before = await croissantStock(ctx);
    const oven = await ovenCount();
    const board = jsonBody<{
      readonly withdrawnSheets: readonly {
        readonly released: readonly { sku: string; quantity: number; free: number }[];
      }[];
    }>(await ctx.asSub(E2E_STAFF_SUB).get(`/admin/packing/${SERVICE_DAY}/board`).expect(200));
    expect(board.withdrawnSheets[0]?.released).toEqual([
      expect.objectContaining({ sku: CROISSANT, quantity: 3 }),
    ]);

    const sent = await sendToShop(ctx.asSub(E2E_STAFF_SUB), {
      siteId,
      key: "panel-1",
      lines: [{ sku: CROISSANT, quantity: 3 }],
    }).expect(201);

    expect(jsonBody<{ readonly id: string }>(sent).id).toBe("panel-1");
    const after = await ctx.prisma.packingStock.findUniqueOrThrow({
      where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
      select: { received: true, packed: true, sentToShop: true },
    });
    expect(after).toEqual({ received: before?.received, packed: before?.packed, sentToShop: 3 });
    expect(await ovenCount()).toEqual(oven);
    const resupply = await ctx.prisma.siteResupply.findUniqueOrThrow({
      where: { id: "panel-1" },
      select: { origin: true, target: true, placedAt: true },
    });
    expect(resupply).toMatchObject({ origin: "reserve", target: "asap" });
    expect(resupply.placedAt).not.toBeNull();
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "packing_stock.sent_to_shop", subjectId: SERVICE_DAY },
      }),
    ).toBe(1);
  });

  it("un second envoi avec la même clé ne sort rien de plus", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);
    const body = { siteId, key: "panel-2", lines: [{ sku: CROISSANT, quantity: 2 }] };

    await sendToShop(ctx.asSub(E2E_STAFF_SUB), body).expect(201);
    await sendToShop(ctx.asSub(E2E_STAFF_SUB), body).expect(201);

    expect(
      (
        await ctx.prisma.packingStock.findUniqueOrThrow({
          where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
          select: { sentToShop: true },
        })
      ).sentToShop,
    ).toBe(2);
    expect(await ctx.prisma.siteResupply.count({ where: { origin: "reserve" } })).toBe(1);
  });

  it("aucun réassort à lancer au fournil, et le comptoir le réceptionne sans lancement", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);
    await sendToShop(ctx.asSub(E2E_STAFF_SUB), {
      siteId,
      key: "panel-3",
      lines: [{ sku: CROISSANT, quantity: 3 }],
    }).expect(201);
    const day = await dayOf("panel-3");

    const tab = jsonBody<ResupplyProductionDayView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/site-resupplies/to-produce/${day}`).expect(200),
    );
    expect(tab.sites.flatMap((site) => site.resupplies.map((r) => r.id))).not.toContain("panel-3");

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/resupply-receipts/${siteId}/resupplies/panel-3/receive`)
      .expect(204);
    const receipt = jsonBody<ResupplyReceiptView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/resupply-receipts/${siteId}/${day}`).expect(200),
    );
    expect(receipt.receptions.find((r) => r.resupplyId === "panel-3")).toMatchObject({
      origin: "reserve",
      status: "received",
    });
  });

  it("libre insuffisant : refus nommé, et ni réassort ni sortie", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);

    const refused = await sendToShop(ctx.asSub(E2E_STAFF_SUB), {
      siteId,
      key: "panel-4",
      lines: [{ sku: CROISSANT, quantity: 500 }],
    }).expect(409);

    expect(jsonBody<{ readonly code: string }>(refused).code).toBe(
      "packing.reserve.short_for_shop",
    );
    expect(await ctx.prisma.siteResupply.count({ where: { id: "panel-4" } })).toBe(0);
    expect(
      (
        await ctx.prisma.packingStock.findUniqueOrThrow({
          where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
          select: { sentToShop: true },
        })
      ).sentToShop,
    ).toBe(0);
  });

  it("deux envois simultanés de la même clé : une seule sortie, les deux répondent", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);
    const body = { siteId, key: "panel-6", lines: [{ sku: CROISSANT, quantity: 2 }] };

    const [first, second] = await Promise.all([
      sendToShop(ctx.asSub(E2E_STAFF_SUB), body),
      sendToShop(ctx.asSub(E2E_STAFF_SUB), body),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(
      (
        await ctx.prisma.packingStock.findUniqueOrThrow({
          where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
          select: { sentToShop: true },
        })
      ).sentToShop,
    ).toBe(2);
    expect(await ctx.prisma.siteResupply.count({ where: { id: "panel-6" } })).toBe(1);
  });

  it("la réserve d'un autre jour que celui du geste : refus nommé, rien ne sort", async () => {
    await returnedByCancellation();
    clock.set(new Date());
    const siteId = await pickupSite(ctx.prisma);

    const refused = await sendToShop(ctx.asSub(E2E_STAFF_SUB), {
      siteId,
      key: "panel-7",
      lines: [{ sku: CROISSANT, quantity: 1 }],
    }).expect(409);

    expect(jsonBody<{ readonly code: string }>(refused).code).toBe("packing.reserve.not_today");
    expect(await ctx.prisma.siteResupply.count({ where: { id: "panel-7" } })).toBe(0);
  });

  it("le comptoir ne l'annule pas : le pain est parti", async () => {
    await returnedByCancellation();
    const siteId = await pickupSite(ctx.prisma);
    await sendToShop(ctx.asSub(E2E_STAFF_SUB), {
      siteId,
      key: "panel-8",
      lines: [{ sku: CROISSANT, quantity: 1 }],
    }).expect(201);

    const refused = await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/site-resupplies/sites/${siteId}/panel-8/cancel`)
      .send({});

    expect(refused.status).toBe(409);
    expect(jsonBody<{ readonly code: string }>(refused).code).toBe(
      "resupply.order.reserve_not_cancellable",
    );
  });
});
