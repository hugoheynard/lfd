/**
 * **Ce que laisse une commande retirée après l'arrêt** (plan A1, lot A1.3 —
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 3 ; C7 § 3.4–3.5).
 *
 * Ce que seul le vrai Postgres prouve : les deux faits durables écrits dans
 * la transaction du retrait, leurs lignes au journal, `order.cancelled` qui
 * le dit ; le poste qui écarte la feuille et la montre à part ; la
 * Supervision qui la compte ; et les aperçus qui disent « prête » quand le bac
 * est fermé, avant le clic.
 */
import type { CustomerOrderDetailView, DaySupervisionView } from "@lfd/contracts";

import { E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bagLines,
  closeOrder,
  closePlan,
  markLine,
  MEMBER,
  relayGate,
  releaseRelay,
  SERVICE_DAY,
  sheetOf,
} from "./production-day-fixture.js";
import {
  bootAfterPlanScene,
  personalPickup,
  setStage,
  staffCancel,
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

/** Une commande de retrait inscrite, une pièce au sac, puis annulée par le staff. */
async function withdrawnAfterPlan(): Promise<{ readonly id: string; readonly reference: string }> {
  await setStage(ctx, "ready");
  const order = await personalPickup(ctx, issued, 3);
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  expect(await bagLines(ctx, await sheetOf(ctx, order.reference))).toBe(204);
  await staffCancel(ctx, order.id).expect(204);
  await ctx.drain();
  return order;
}

const outboxTypes = async (orderId: string) =>
  (
    await ctx.prisma.outboxMessage.findMany({
      where: { key: { contains: orderId } },
      select: { type: true },
    })
  ).map((row) => row.type);

describe("les faits du retrait", () => {
  it("fournil et colisage publient chacun leur fait durable, une fois", async () => {
    const order = await withdrawnAfterPlan();

    const types = await outboxTypes(order.id);
    expect(types.filter((type) => type === "production.order_withdrawn_after_close")).toHaveLength(
      1,
    );
    expect(types.filter((type) => type === "packing.sheet_withdrawn")).toHaveLength(1);
    const sheetFact = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "packing.sheet_withdrawn", key: { contains: order.id } },
      select: { payload: true },
    });
    expect(sheetFact.payload).toMatchObject({
      serviceDay: SERVICE_DAY,
      orderId: order.id,
      released: [expect.objectContaining({ quantity: 3 })],
    });
  });

  it("le journal les porte, et `order.cancelled` dit « après l'inscription », étape « prête »", async () => {
    const order = await withdrawnAfterPlan();

    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "packing_sheet.withdrawn", subjectId: order.id },
      }),
    ).toBe(1);
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "production_day.order_withdrawn", subjectId: SERVICE_DAY },
      }),
    ).toBe(1);
    const cancelled = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "order.cancelled" },
      select: { payload: true },
    });
    expect(cancelled.payload).toMatchObject({ afterInscription: true, stageApplied: "ready" });
  });
});

describe("les écrans", () => {
  it("le poste écarte la feuille retirée, et la montre à part", async () => {
    const order = await withdrawnAfterPlan();

    const board = await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`/admin/packing/${SERVICE_DAY}/board`)
      .expect(200);
    const view = jsonBody<{
      readonly sheets: readonly { readonly reference: string }[];
      readonly withdrawnSheets: readonly { readonly orderId: string }[];
    }>(board);
    expect(view.sheets.map((sheet) => sheet.reference)).not.toContain(order.reference);
    expect(view.withdrawnSheets.map((sheet) => sheet.orderId)).toEqual([order.id]);
  });

  it("la Supervision compte l'annulée après l'arrêt à part", async () => {
    await withdrawnAfterPlan();

    const response = await ctx
      .asSub(E2E_STAFF_SUB)
      .get(`/admin/supervision/day?date=${SERVICE_DAY}`)
      .expect(200);
    const pickup = jsonBody<DaySupervisionView>(response).flow.find(
      (line) => line.fulfillmentMethod === "pickup",
    );
    expect(pickup).toMatchObject({ cancelled: 1, cancelledAfterPlan: 1 });
  });

  it("bac fermé, commande pas encore « prête » : les deux aperçus disent non avant le clic", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued, 3);
    await closePlan(ctx);
    await ctx.drain();
    expect(await markLine(ctx)).toBe(204);
    await ctx.drain();
    expect(await bagLines(ctx, await sheetOf(ctx, order.reference))).toBe(204);
    relayGate.open = false;
    expect(await closeOrder(ctx, order.id)).toBe(204);

    const admin = await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${order.id}`).expect(200);
    expect(jsonBody<{ readonly cancellability: unknown }>(admin).cancellability).toEqual({
      cancellable: false,
      reason:
        "Le colisage a déjà fermé le bac de cette commande : elle est prête et ne s'annule plus. Voyez avec le colisage.",
    });
    const mine = await ctx.asSub(MEMBER).get(`/orders/${order.id}`).expect(200);
    expect(jsonBody<CustomerOrderDetailView>(mine).cancellability).toEqual({
      cancellable: false,
      code: "ready",
      until: null,
    });
    await releaseRelay(ctx);
  });
});
