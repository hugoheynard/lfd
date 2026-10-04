/**
 * E2E de **la bascule du colisage** — plan `documentation/colisage/plan-domaine-colisage.md`,
 * lot K2 (§12 corrigé par §13, §15).
 *
 * La répétition que le §13 demande, rejouée à chaque passage : la MÊME journée
 * — clôture, fournées, colisage, une fournée annulée, une fermeture — est jouée
 * deux fois, par les mêmes routes :
 *
 * - une fois sur l'ancien poste, telle qu'une journée arrêtée avant K2
 *   (`closeLegacyPlan` : depuis K2, aucune clôture ne fait plus naître de
 *   journée `legacy`, d'où la seule écriture en base de la suite) ;
 * - une fois sur le colisage, telle qu'une journée arrêtée par ce binaire.
 *
 * Ce que l'écran et le commerce en voient doit être IDENTIQUE : le poste, la
 * fiche, les statuts des commandes, les fournées. Les faits de la boîte d'envoi
 * ne le sont PAS, et c'est voulu : l'émetteur de la fermeture change de nom
 * (`packing.order_packed`), et une annulation devient une demande et sa
 * réponse. Le test l'écrit plutôt que de le taire.
 */
import type { ProductionPackingView } from "@lfd/contracts";

import { createUser } from "./factories.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  cancelBatch,
  closeLegacyPlan,
  closePlan,
  pack,
  packing,
  place,
  recordBatch,
  references,
  storedBatches,
  worksheetLine,
} from "./production-day-fixture.js";

/** Des ULID de forme valide, tirés « par l'écran ». */
const FIRST = "01K6A0000000000000000000A1";
const SECOND = "01K6A0000000000000000000B2";
const THIRD = "01K6A0000000000000000000C3";

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

/** Le relais livre en chaîne (demande → décision → réponse) : on draine jusqu'au calme. */
async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/**
 * Ce qui se voit d'une journée, sans les instants ni les références — deux
 * jeux, deux horloges, deux numéros de commande ; l'ordre du poste, lui, reste.
 */
function boardOf(view: ProductionPackingView) {
  return {
    orderCount: view.orderCount,
    todoCount: view.todoCount,
    readyCount: view.readyCount,
    resources: view.resources,
    sheets: view.sheets.map((sheet) => ({
      containers: sheet.containers,
      packed: sheet.packedAt !== null,
      packedBy: sheet.packedBy,
      packedLines: sheet.packedLines,
      packedPieces: sheet.packedPieces,
      canDeclareReady: sheet.canDeclareReady,
      lines: sheet.lines.map((line) => ({
        sku: line.sku,
        packed: line.packed,
        initials: line.initials,
        awaitingProduction: line.awaitingProduction,
      })),
    })),
  };
}

/**
 * **La journée**, jouée de bout en bout par les routes. Deux bons (8 et 4
 * croissants), deux fournées (12 puis 5), les deux bons au bac, un container
 * compté, la seconde fournée annulée — ses 5 pièces ne sont dans aucun sac —,
 * puis le premier bac fermé.
 */
async function playDay(close: (context: E2eContext) => Promise<void>) {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 8 }]);
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await close(ctx);
  await settle();
  const [first, second] = await references(ctx);
  if (first === undefined || second === undefined) {
    throw new Error("La journée devait porter deux bons.");
  }

  expect(await recordBatch(ctx, FIRST, 12)).toBe(204);
  expect(await recordBatch(ctx, SECOND, 5)).toBe(204);
  await settle();
  expect(await pack(ctx, first)).toBe(204);
  expect(await pack(ctx, second)).toBe(204);
  await ctx
    .asSub(STAFF)
    .post(`/admin/production/packing/${SERVICE_DAY}/sheets/${second}/containers/add`)
    .expect(204);
  expect(await cancelBatch(ctx, SECOND)).toBe(204);
  await settle();
  await ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${first}/packed`)
    .expect(201);
  await settle();

  const orders = await ctx.prisma.order.findMany({
    where: { orderNumber: { in: [first, second] } },
    select: { orderNumber: true, status: true },
    orderBy: { orderNumber: "asc" },
  });
  const line = await worksheetLine(ctx);
  return {
    board: boardOf(await packing(ctx)),
    orders: orders.map((order) => order.status),
    worksheet: {
      produced: line.produced,
      remaining: line.remaining,
      done: line.done,
      batches: line.batches.map((batch) => batch.id),
      pendingReturn: line.pendingReturn ?? 0,
    },
    batches: (await storedBatches(ctx)).map((batch) => ({
      id: batch.id,
      quantity: batch.quantity,
      cancelled: batch.cancelledAt !== null,
    })),
    ready: await ctx.prisma.outboxMessage.count({
      where: { type: { in: ["production.order_packed", "packing.order_packed"] } },
    }),
  };
}

async function ownerOf(): Promise<string> {
  return (
    await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { packingOwner: true },
    })
  ).packingOwner;
}

describe("la bascule du colisage — la même journée, deux postes", () => {
  it("🔴 une journée colisée au COLISAGE se voit exactement comme sur l'ancien poste", async () => {
    const legacy = await playDay(closeLegacyPlan);
    expect(await ownerOf()).toBe("legacy");

    await ctx.reset();
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const switched = await playDay(closePlan);
    expect(await ownerOf()).toBe("packing");

    expect(switched).toEqual(legacy);
    // Et ce que les deux disent, écrit : un bac prêt, l'autre non ; la seconde
    // fournée annulée, « sorti » revenu à 12.
    expect(switched.orders).toEqual(["ready", "confirmed"]);
    expect(switched.worksheet).toMatchObject({ produced: 12, pendingReturn: 0 });
    expect(switched.batches).toEqual([
      { id: FIRST, quantity: 12, cancelled: false },
      { id: SECOND, quantity: 5, cancelled: true },
    ]);
  });

  it("les faits diffèrent, et c'est voulu : le colisage ferme, et l'annulation se demande", async () => {
    await playDay(closePlan);

    const types = await ctx.prisma.outboxMessage.findMany({
      where: { type: { startsWith: "p" } },
      select: { type: true },
    });
    const count = (type: string) => types.filter((fact) => fact.type === type).length;
    expect(count("packing.order_packed")).toBe(1);
    expect(count("production.order_packed")).toBe(0);
    expect(count("production.return_requested")).toBe(1);
    expect(count("packing.returned")).toBe(1);
  });
});

describe("une journée `packing` — ce qui n'a pas d'équivalent sur l'ancien poste", () => {
  async function packedDay(): Promise<readonly string[]> {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await settle();
    expect(await recordBatch(ctx, FIRST, 12)).toBe(204);
    await settle();
    return references(ctx);
  }

  it("annuler une fournée dont tout est au bac : un REFUS du colisage, et rien ne bouge", async () => {
    // Sur l'ancien poste, c'est un 409 immédiat (`BatchStillPackedError`). Ici,
    // la demande part, le colisage rend 0 (Q5), et « sorti » ne bouge pas.
    const [reference] = await packedDay();
    expect(await pack(ctx, reference ?? "")).toBe(204);

    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    await settle();

    expect(await worksheetLine(ctx)).toMatchObject({ produced: 12, pendingReturn: 0 });
    expect((await storedBatches(ctx))[0]?.cancelledAt).toBeNull();
    const answer = await ctx.prisma.productionReturnRequest.findFirstOrThrow({
      select: { returned: true },
    });
    expect(answer.returned).toBe(0);
  });

  it("« retour en attente » se lit sur la fiche tant que le colisage n'a pas répondu", async () => {
    await packedDay();

    expect(await cancelBatch(ctx, FIRST)).toBe(204);

    // Aucun drain : la demande est écrite, la réponse n'est pas encore venue.
    expect(await worksheetLine(ctx)).toMatchObject({ produced: 12, pendingReturn: 12 });
    expect(await cancelBatch(ctx, FIRST)).toBe(409);
    await settle();
    expect(await worksheetLine(ctx)).toMatchObject({ produced: 0, pendingReturn: 0 });
  });

  it("mettre au bac plus que la remise reçue est refusé AU COLISAGE, avec le message d'avant", async () => {
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 12 }]);
    await closePlan(ctx);
    await settle();
    expect(await recordBatch(ctx, THIRD, 5)).toBe(204);
    await settle();
    const [reference] = await references(ctx);

    const response = await ctx
      .asSub(STAFF)
      .put(`/admin/production/packing/${SERVICE_DAY}/sheets/${reference ?? ""}/lines/${CROISSANT}`)
      .send({ initials: "MB" });

    expect(response.status).toBe(409);
    expect(jsonBody<{ code: string }>(response).code).toBe("production.packing.not_produced_yet");
  });
});
