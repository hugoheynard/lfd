/**
 * **Rouvrir une journée arrêtée** (Hugo, 2026-10-14,
 * `documentation/plan-de-lancement-2026-11-20.md`, §3).
 *
 * Ce que seul le vrai Postgres prouve : que la réouverture défait l'arrêt
 * chez TOUS ceux qui l'avaient appris — le fournil, le commerce, le
 * colisage, la livraison — par la boîte d'envoi ; qu'un client peut de
 * nouveau commander ; et que l'arrêt suivant refait tout, liste à coliser
 * comprise (la clé de son fait était celle du premier tirage).
 */
import { createUser } from "./factories.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan as closePlanOnly,
  packingOrderPath,
  place,
  recordBatch,
} from "./production-day-fixture.js";

const BATCH = "01K6A0000000000000000000R1";

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
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Arrête le plan, puis laisse les abonnés livrer. */
async function closePlan(context: E2eContext): Promise<void> {
  await closePlanOnly(context);
  await context.drain();
}

async function reopen() {
  const response = await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/reopen`);
  await ctx.drain();
  return response;
}

async function ordersOfDay() {
  return ctx.prisma.order.findMany({
    where: { requestedDeliveryDate: new Date(`${SERVICE_DAY}T00:00:00.000Z`) },
    select: { id: true, status: true, confirmedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

async function packingList(): Promise<readonly string[]> {
  const rows = await ctx.prisma.packingOrder.findMany({
    where: { serviceDay: SERVICE_DAY },
    select: { orderId: true },
  });
  return rows.map((row) => row.orderId).sort();
}

async function productionDay() {
  return ctx.prisma.productionDay.findUniqueOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { closedAt: true, reopenedAt: true, reopenedBy: true },
  });
}

describe("rouvrir une journée arrêtée", () => {
  it("arrêter → rouvrir → commander → arrêter retrouve un état cohérent partout", async () => {
    await place(ctx, issued, [{ sku: "VIE-001", quantity: 2 }]);
    await closePlan(ctx);
    const [first] = await ordersOfDay();
    expect(first?.status).toBe("confirmed");
    expect(await packingList()).toEqual([first?.id]);

    const response = await reopen();

    expect(response.status).toBe(201);
    expect(jsonBody<{ released: number }>(response).released).toBe(1);
    const reopened = await productionDay();
    expect(reopened.closedAt).toBeNull();
    // L'auteur est la fiche staff résolue par le guard, pas le `sub` du jeton.
    expect(reopened.reopenedBy).not.toBeNull();
    expect(await ctx.prisma.productionOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(0);
    expect(await ordersOfDay()).toEqual([{ id: first?.id, status: "placed", confirmedAt: null }]);
    expect(await packingList()).toEqual([]);
    const readiness = await ctx.prisma.deliveryDayReadiness.findUnique({
      where: { serviceDay: SERVICE_DAY },
    });
    expect(readiness?.closedAt ?? null).toBeNull();
    const journal = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "production_day.reopened" },
    });
    expect(journal.subjectId).toBe(SERVICE_DAY);

    // Le client commande de nouveau pour ce jour : la journée est ouverte.
    await place(ctx, issued, [{ sku: "VIE-001", quantity: 1 }]);
    await closePlan(ctx);

    const after = await ordersOfDay();
    const { closedAt } = await productionDay();
    expect(after.map((order) => order.status)).toEqual(["confirmed", "confirmed"]);
    expect(after.map((order) => order.confirmedAt)).toEqual([closedAt, closedAt]);
    expect(await packingList()).toEqual(after.map((order) => order.id).sort());
    const again = await ctx.prisma.deliveryDayReadiness.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
    });
    expect(again.closedAt).toEqual(closedAt);
  });

  it("refuse une journée ouverte", async () => {
    await place(ctx, issued, [{ sku: "VIE-001", quantity: 1 }]);

    const response = await reopen();

    expect(response.status).toBe(409);
  });

  it("refuse dès qu'une fournée est déclarée, et la journée reste arrêtée", async () => {
    await place(ctx, issued, [{ sku: "VIE-001", quantity: 2 }]);
    await closePlan(ctx);
    expect(await recordBatch(ctx, BATCH, 1)).toBe(204);

    const response = await reopen();

    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toContain("fournée");
    expect((await productionDay()).closedAt).not.toBeNull();
    expect((await ordersOfDay())[0]?.status).toBe("confirmed");
  });

  it("refuse quand le colisage a commencé", async () => {
    await place(ctx, issued, [{ sku: "VIE-001", quantity: 2 }]);
    await closePlan(ctx);
    const [order] = await ordersOfDay();
    // Un sac ouvert suffit : le colisage a commencé, rien n'est encore dedans.
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(order?.id ?? "")}/containers`)
      .send({ nature: "bag" })
      .expect(201);

    const response = await reopen();

    expect(response.status).toBe(409);
    expect(jsonBody<{ message: string }>(response).message).toContain("colisage");
    expect(await packingList()).toEqual([order?.id]);
  });
});

/**
 * Régression : un jour hors AAAA-MM-JJ sortait en 500 `internal.unexpected` sur
 * toutes les routes de la journée — le `ZodError` d'un `.parse` écrit dans la
 * route n'était pas catégorisé (fix 2026-10-22).
 */
describe("un chemin mal formé", () => {
  it("🔴 un jour mal formé est refusé en 400 qui nomme le paramètre, sur chaque route de la journée", async () => {
    const day = "/admin/production/batch/demain";
    const responses = await Promise.all([
      ctx.asSub(STAFF).get(`${day}/compte-a-produire.pdf`),
      ctx.asSub(STAFF).get(`${day}/dossier.pdf`),
      ctx.asSub(STAFF).get(`${day}/sheets/CMD-1.pdf`),
      ctx.asSub(STAFF).get(`${day}/due-thresholds`),
      ctx.asSub(STAFF).get(`${day}/resupplies`),
      ctx.asSub(STAFF).get(`${day}/status`),
      ctx.asSub(STAFF).post(`${day}/close`),
      ctx.asSub(STAFF).post(`${day}/reopen`),
    ]);

    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(400));
    for (const response of responses) {
      expect(JSON.stringify(response.body)).toContain("date");
    }
  });
});
