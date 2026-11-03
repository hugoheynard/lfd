/**
 * E2E de **la fiche de colis d'un envoi remis** (Hugo, 2026-11-03, option b ;
 * plan `documentation/comptoir/plan-depart-incomplet-au-comptoir.md`, §7).
 *
 * Une commande remise sans être colisée laissait sa fiche ouverte au poste ;
 * fermer le bac ensuite publiait `packing.order_packed`, que le commerce
 * refusait (« déjà retirée ») — en message mort. Le colisage écoute désormais
 * `handover.handed_over` : rien au bac, la fiche est retirée ; des pièces au
 * bac, elle est fermée telle quelle ; un bac déjà fermé ne bouge pas.
 *
 * Le jour du comptoir est celui de l'horloge, gelée le jour de service de la
 * scène, à midi.
 */
import { localToInstant } from "@lfd/contracts";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closeOrder,
  packing,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, type Drawn } from "./shortfall-decision-scene.js";

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

/** « Remettre la commande » au comptoir, saisie — puis la boîte d'envoi relayée. */
async function handOver(order: Drawn): Promise<void> {
  clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());
  await ctx.asSub(STAFF).post(`/admin/handover/manual/${order.orderNumber}`).send({}).expect(201);
  await ctx.drain();
  expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
    status: "fulfilled",
  });
}

async function deadLetters(): Promise<number> {
  return ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } });
}

async function packingRow(orderId: string): Promise<{
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly withdrawnAt: Date | null;
}> {
  return ctx.prisma.packingOrder.findFirstOrThrow({
    where: { orderId, rank: 1 },
    select: { packedAt: true, packedBy: true, withdrawnAt: true },
  });
}

describe("Colisage — un envoi remis sort de la liste à coliser", () => {
  it("rien au bac : la fiche est retirée, et fermer le bac ensuite est refusé, sans message mort", async () => {
    const order = await accountOrder(ctx, 0);

    await handOver(order);

    const view = await packing(ctx);
    expect(view.sheets.map((sheet) => sheet.orderId)).not.toContain(order.id);
    expect(view.withdrawnSheets).toEqual([
      expect.objectContaining({ orderId: order.id, released: [] }),
    ]);
    const close = await ctx
      .asSub(STAFF)
      .post(`/admin/packing/${SERVICE_DAY}/orders/${order.id}/close`);
    expect(close.status).toBe(409);
    expect(close.body).toMatchObject({ code: "packing.sheet.withdrawn" });
    await ctx.drain();
    expect(await deadLetters()).toBe(0);
  });

  it("des pièces au bac, incomplet : la fiche est fermée telle quelle, sans message mort", async () => {
    const order = await accountOrder(ctx, 1);

    await handOver(order);

    const row = await packingRow(order.id);
    expect(row.withdrawnAt).toBeNull();
    expect(row.packedAt).not.toBeNull();
    const sheet = await sheetOf(ctx, order.orderNumber);
    // Ce qui était au bac y reste : il est parti avec le client.
    expect(sheet.packedAt).not.toBeNull();
    expect(await deadLetters()).toBe(0);
  });

  it("rejoué, le fait n'écrit rien de plus", async () => {
    const order = await accountOrder(ctx, 1);
    await handOver(order);
    const before = await packingRow(order.id);

    // La boîte d'envoi relivre : le reçu de l'abonné est remis à livrer.
    const replayed = await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: "packing.leave-handed-over-sheet" },
      data: { deliveredAt: null, nextAttemptAt: new Date(0) },
    });
    expect(replayed.count).toBe(1);
    await ctx.drain();

    expect(await packingRow(order.id)).toEqual(before);
    expect(await deadLetters()).toBe(0);
  });

  it("un bac fermé au colisage avant la remise ne bouge pas", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    const packed = await packingRow(order.id);
    expect(packed.packedAt).not.toBeNull();

    await handOver(order);

    expect(await packingRow(order.id)).toEqual(packed);
    expect(await deadLetters()).toBe(0);
  });
});
