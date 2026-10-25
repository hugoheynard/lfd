/**
 * **Retirer une commande inscrite au plan** (plan A1, lot A1.2 —
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 1, § 2.2, § 2.3, § 2.7 ; tests de C7 § 5).
 *
 * Ce que seul le vrai Postgres prouve : la pierre tombale et le tirage qui
 * arrive après elle, les contenants annulés et la réserve rendue par
 * `release` (jamais `giveBack`), le compte du fournil inchangé, le BL annulé,
 * le remboursement demandé — et les refus, qui n'écrivent rien.
 */
import { OrderStatus } from "../src/platform/database/client/client.js";
import type { E2eContext } from "./e2e-harness.js";
import {
  bagLines,
  closeOrder,
  closePlan,
  markLine,
  relayGate,
  releaseRelay,
  sheetOf,
} from "./production-day-fixture.js";
import {
  bootAfterPlanScene,
  codeOf,
  croissantStock,
  customerCancel,
  inscriptionsOf,
  packingRowOf,
  personalPickup,
  setStage,
  staffCancel,
  withdrawalOf,
} from "./order-cancel-after-plan-scene.js";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootAfterPlanScene());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  relayGate.open = true;
  await ctx.reset();
});

const statusOf = async (orderId: string) =>
  (await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } }))
    .status;

describe("étape « arrêt du plan » : une commande inscrite reste refusée", () => {
  it("au particulier comme au staff, et rien n'est retiré", async () => {
    await setStage(ctx, "production_plan");
    const order = await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();

    expect(codeOf(await customerCancel(ctx, order.id))).toBe(
      "orders.customer_cancel.in_preparation",
    );
    expect(codeOf(await staffCancel(ctx, order.id))).toBe("orders.cancel.inscribed");
    expect(await withdrawalOf(ctx, order.id)).toBeNull();
    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).toBeNull();
  });
});

describe("étape « prête » : une commande de retrait inscrite se retire", () => {
  it("feuille pas encore tirée : pierre tombale, et le tirage qui arrive n'insère aucune ligne", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    relayGate.open = false;
    await closePlan(ctx);

    await staffCancel(ctx, order.id).expect(204);
    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).not.toBeNull();
    await releaseRelay(ctx);

    const row = await packingRowOf(ctx, order.id);
    expect(row?.withdrawnAt).not.toBeNull();
    expect(row?.lines).toEqual([]);
    expect(await statusOf(order.id)).toBe(OrderStatus.cancelled);
    expect(await withdrawalOf(ctx, order.id)).toEqual({ afterInscription: true });
    expect(await inscriptionsOf(ctx, order.id)).toBe(1);
  });

  it("feuille tirée, intouchée : retirée par le particulier lui-même", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();

    await customerCancel(ctx, order.id).expect(204);
    await ctx.drain();

    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).not.toBeNull();
    expect(await statusOf(order.id)).toBe(OrderStatus.cancelled);
    expect(await inscriptionsOf(ctx, order.id)).toBe(1);
  });

  it("feuille entamée : sac annulé, réserve rendue, compte inchangé, remboursement demandé", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued, 3);
    await closePlan(ctx);
    await ctx.drain();
    expect(await markLine(ctx)).toBe(204);
    await ctx.drain();
    expect(await bagLines(ctx, await sheetOf(ctx, order.reference))).toBe(204);
    const before = await croissantStock(ctx);
    expect(before?.packed).toBe(3);

    await staffCancel(ctx, order.id).expect(204);
    await ctx.drain();

    const row = await packingRowOf(ctx, order.id);
    expect(row?.withdrawnAt).not.toBeNull();
    expect(row?.containers.every((container) => container.voidedAt !== null)).toBe(true);
    // `release` : le reçu et le rendu au fournil n'ont pas bougé (`vitruve` B1).
    expect(await croissantStock(ctx)).toEqual({
      received: before?.received,
      returned: before?.returned,
      packed: 0,
    });
    expect(await inscriptionsOf(ctx, order.id)).toBe(1);
    expect(await ctx.prisma.orderRefundRequest.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "packing_container.voided", subjectId: order.id },
      }),
    ).toBe(1);
  });

  it("une feuille retirée refuse tout geste du poste", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();
    await staffCancel(ctx, order.id).expect(204);

    const response = await closeOrder(ctx, order.id);

    expect(response).toBe(409);
  });

  it("le BL prévu à l'arrêt est annulé avec la commande (§ 2.7)", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();
    expect(await ctx.prisma.deliveryNote.count({ where: { orderId: order.id } })).toBeGreaterThan(
      0,
    );

    await staffCancel(ctx, order.id).expect(204);

    const notes = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: order.id },
      select: { status: true },
    });
    expect(notes.map((note) => note.status)).toEqual(notes.map(() => "voided"));
  });
});

describe("étape « prête » : ce qui reste refusé", () => {
  it("bac fermé : `packed`, et la feuille ne bouge pas", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued, 3);
    await closePlan(ctx);
    await ctx.drain();
    expect(await markLine(ctx)).toBe(204);
    await ctx.drain();
    expect(await bagLines(ctx, await sheetOf(ctx, order.reference))).toBe(204);
    relayGate.open = false;
    expect(await closeOrder(ctx, order.id)).toBe(204);

    // `markReady` n'est pas encore passé (relais retenu) : c'est le colisage qui refuse.
    expect(codeOf(await staffCancel(ctx, order.id))).toBe("orders.cancel.packed");
    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).toBeNull();
    expect(await withdrawalOf(ctx, order.id)).toBeNull();
    await releaseRelay(ctx);
    expect(codeOf(await customerCancel(ctx, order.id))).toBe("orders.customer_cancel.ready");
  });
});
