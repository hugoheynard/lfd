/**
 * **Retirer une commande inscrite : les courses, la réouverture, le manque**
 * (plan A1, lot A1.2 —
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.4, § 2.5, § 2.6 ; courses de C7 § 5).
 *
 * Les gestes vont en parallèle sur le vrai Postgres : l'ordre des verrous
 * (ligne `orders` → journée → feuille → bac → réserve) ne se prouve qu'ici.
 * Une course qui finit en interblocage rend un 500 ; aucune ne doit.
 */
import type { AdminOrdersPage } from "@lfd/contracts";

import { OrderStatus } from "../src/platform/database/client/client.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  bagLines,
  closePlan,
  markLine,
  packingOrderPath,
  relayGate,
  releaseRelay,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import {
  bootAfterPlanScene,
  codeOf,
  croissantStock,
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

/** Une commande inscrite, colisée en partie : 3 croissants dus, `bagged` au sac. */
async function startedOrder(bagged: number) {
  await setStage(ctx, "ready");
  const order = await personalPickup(ctx, issued, 3);
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, order.reference);
  expect(await bagLines(ctx, sheet, [{ sku: sheet.lines[0]?.sku ?? "", quantity: bagged }])).toBe(
    204,
  );
  return order;
}

describe("les courses (§ 2.4)", () => {
  it("annulation × fermeture du bac : une seule gagne, sans interblocage", async () => {
    const order = await startedOrder(3);
    relayGate.open = false;

    const [cancelled, closed] = await Promise.all([
      staffCancel(ctx, order.id),
      ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/close`),
    ]);
    await releaseRelay(ctx);

    expect([cancelled.status, closed.status].sort()).toEqual([204, 409]);
    const row = await packingRowOf(ctx, order.id);
    if (cancelled.status === 204) {
      expect(row?.withdrawnAt).not.toBeNull();
      expect(row?.packedAt).toBeNull();
      expect((await croissantStock(ctx))?.packed).toBe(0);
    } else {
      expect(codeOf(cancelled)).toBe("orders.cancel.packed");
      expect(row?.withdrawnAt).toBeNull();
      expect(await withdrawalOf(ctx, order.id)).toBeNull();
    }
  });

  it("annulation × décision de manque : pas d'interblocage, la carte refuse le départ incomplet", async () => {
    const order = await startedOrder(1);
    expect((await ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/shortfall`)).status).toBe(
      204,
    );
    await ctx.drain();

    const [cancelled, decided] = await Promise.all([
      staffCancel(ctx, order.id),
      ctx
        .asSub(STAFF)
        .post(`/admin/orders/${order.id}/shortfall-decision`)
        .send({ remainder: "abandoned" }),
    ]);

    expect(cancelled.status).toBe(204);
    expect(decided.status).toBe(409);
    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).not.toBeNull();
  });

  it("deux annulations en même temps : une écrit, l'autre dit « déjà annulée »", async () => {
    const order = await startedOrder(2);

    const [first, second] = await Promise.all([
      staffCancel(ctx, order.id),
      staffCancel(ctx, order.id),
    ]);

    expect([first.status, second.status].sort()).toEqual([204, 409]);
    expect((await croissantStock(ctx))?.packed).toBe(0);
  });
});

describe("la réouverture de la journée (§ 2.5)", () => {
  it("arrêt → annulation → réouverture → reclôture : la commande n'est pas réinscrite", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    // Une seconde commande, qui reste : une journée vide ne s'arrête pas
    // (`ProductionDayEmptyError`), la reclôture a donc besoin de quelque chose.
    const kept = await personalPickup(ctx, issued);
    await closePlan(ctx);
    await ctx.drain();
    await staffCancel(ctx, order.id).expect(204);
    await ctx.drain();

    await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`).expect(201);
    await ctx.drain();
    // Rien n'avait commencé : la feuille intouchée s'efface, retrait compris.
    expect(await packingRowOf(ctx, order.id)).toBeNull();
    await closePlan(ctx);
    await ctx.drain();

    expect(await inscriptionsOf(ctx, order.id)).toBe(0);
    expect(await inscriptionsOf(ctx, kept.id)).toBe(1);
    expect(await packingRowOf(ctx, order.id)).toBeNull();
    expect(await withdrawalOf(ctx, order.id)).toEqual({ afterInscription: true });
    const status = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    });
    expect(status.status).toBe(OrderStatus.cancelled);
  });
});

describe("le manque signalé d'un particulier (§ 2.6)", () => {
  it("signalé → annulé : le signal reste écrit, la liste ne l'attend plus", async () => {
    const order = await startedOrder(1);
    expect((await ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/shortfall`)).status).toBe(
      204,
    );
    await ctx.drain();

    await staffCancel(ctx, order.id).expect(204);
    await ctx.drain();

    const written = await ctx.prisma.orderShortfall.findUniqueOrThrow({
      where: { orderId_rank: { orderId: order.id, rank: 1 } },
      select: { reportedAt: true },
    });
    expect(written.reportedAt).not.toBeNull();
    const page = jsonBody<AdminOrdersPage>(await ctx.asSub(STAFF).get("/admin/orders").expect(200));
    expect(page.rows.find((row) => row.id === order.id)?.shortfallReportedAt).toBeNull();
  });
});

describe("le tirage et l'annulation (C7 § 5)", () => {
  it("la liste arrive APRÈS l'annulation : aucune ligne de feuille, rien à coliser", async () => {
    await setStage(ctx, "ready");
    const order = await personalPickup(ctx, issued);
    relayGate.open = false;
    await closePlan(ctx);
    await staffCancel(ctx, order.id).expect(204);

    await releaseRelay(ctx);

    expect(
      await ctx.prisma.packingLine.count({ where: { serviceDay: SERVICE_DAY, orderId: order.id } }),
    ).toBe(0);
    expect((await packingRowOf(ctx, order.id))?.withdrawnAt).not.toBeNull();
  });
});
