import { randomUUID } from "node:crypto";

import type {
  AdminOrderView,
  DaySupervisionView,
  OpenedPackingContainer,
  PackingSheet,
  ProductionForecastView,
  ProductionWorksheetView,
} from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";

import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  packingOrderPath,
  recordBatch,
  sheetOf,
  worksheetLine,
} from "./production-day-fixture.js";

/**
 * E2E — **la vente au poids au fournil et au colisage**
 * (`documentation/pricing/vente-au-poids.md`, P6).
 *
 * Ce que seul le vrai Postgres prouve : l'unité de la ligne de commande
 * traverse l'arrêt du plan (`production_order_line.sale_unit`,
 * `production_count.sale_unit`, sous leurs CHECK), le fait durable de la liste
 * à coliser (`packing_line.sale_unit`), et ressort aux écrans — fiche
 * d'atelier, prévisionnel, poste de colisage, manque, Supervision — en grammes,
 * jamais en pièces. Une commande mêlée et une journée mêlée ne mélangent pas
 * les unités.
 */

/** Le pain au chocolat du semis devient un article au poids, par 50 g. */
const WEIGHED = "VIE-002";
/** 42,20 € TTC le kilo, à 5,5 % : de quoi régler par carte. */
const PUBLIC_LABEL_PER_KG_CENTS = 4_220;

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
  await sellByWeight();
});

async function sellByWeight(): Promise<void> {
  const htMillicents = htMillicentsOf(PUBLIC_LABEL_PER_KG_CENTS, 5.5);
  if (htMillicents === null) {
    throw new Error("Étiquette sans hors taxe.");
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: `${WEIGHED}-1` },
    data: {
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: null,
      publicTtcCents: PUBLIC_LABEL_PER_KG_CENTS,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
    },
  });
}

type Line = { readonly sku: string; readonly quantity: number; readonly saleUnit: string };
const croissants = (quantity: number): Line => ({ sku: CROISSANT, quantity, saleUnit: "piece" });
const chocolate = (grams: number): Line => ({ sku: WEIGHED, quantity: grams, saleUnit: "weight" });

/** Une commande de retrait PAYÉE pour la journée servie ; rend sa référence. */
async function place(lines: readonly Line[]): Promise<{ id: string; reference: string }> {
  const site =
    (await ctx.prisma.site.findFirst({ select: { id: true } })) ??
    (await ctx.prisma.site.create({
      data: {
        label: "Boutique",
        ligne1: "12 rue du Test",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    }));
  const placed = jsonBody<{ id: string; orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId: site.id,
        note: "",
        lines,
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issued);
  return { id: placed.id, reference: placed.orderNumber };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Deux commandes : une mêlée (12 croissants + 1,25 kg), une au poids seul (500 g). */
async function mixedDay(): Promise<{ mixed: { id: string; reference: string } }> {
  const mixed = await place([croissants(12), chocolate(1250)]);
  await place([chocolate(500)]);
  await closePlan(ctx);
  await settle();
  return { mixed };
}

async function openBag(orderId: string): Promise<string> {
  return jsonBody<OpenedPackingContainer>(
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(orderId)}/containers`)
      .send({ nature: "bag" })
      .expect(201),
  ).containerId;
}

function put(orderId: string, bag: string, sku: string, quantity: number) {
  return ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(orderId)}/containers/${bag}/lines/${sku}`)
    .send({ quantity });
}

describe("l'arrêt du plan recopie l'unité", () => {
  it("fige chaque ligne avec son unité, et compte l'article au poids en grammes", async () => {
    await mixedDay();

    const lines = await ctx.prisma.productionOrderLine.findMany({
      where: { order: { serviceDay: SERVICE_DAY } },
      select: { sku: true, quantity: true, saleUnit: true },
      orderBy: [{ quantity: "asc" }],
    });
    expect(lines).toEqual([
      { sku: CROISSANT, quantity: 12, saleUnit: "piece" },
      { sku: WEIGHED, quantity: 500, saleUnit: "weight" },
      { sku: WEIGHED, quantity: 1250, saleUnit: "weight" },
    ]);
    const counts = await ctx.prisma.productionCount.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { sku: true, quantity: true, saleUnit: true },
      orderBy: { sku: "asc" },
    });
    expect(counts).toEqual([
      { sku: CROISSANT, quantity: 12, saleUnit: "piece" },
      { sku: WEIGHED, quantity: 1750, saleUnit: "weight" },
    ]);
  });

  it("la liste à coliser inscrit l'unité de chaque ligne", async () => {
    const { mixed } = await mixedDay();

    const lines = await ctx.prisma.packingLine.findMany({
      where: { serviceDay: SERVICE_DAY, orderId: mixed.id },
      select: { sku: true, quantity: true, saleUnit: true },
      orderBy: { sku: "asc" },
    });
    expect(lines).toEqual([
      { sku: CROISSANT, quantity: 12, saleUnit: "piece" },
      { sku: WEIGHED, quantity: 1250, saleUnit: "weight" },
    ]);
  });

  /** Rétrocompatibilité : une journée sans article au poids se lit exactement comme avant. */
  it("une journée tout à la pièce reste à la pièce, du plan à la fiche", async () => {
    await place([croissants(4)]);
    await closePlan(ctx);
    await settle();

    expect(
      await ctx.prisma.productionCount.findMany({
        where: { serviceDay: SERVICE_DAY },
        select: { saleUnit: true },
      }),
    ).toEqual([{ saleUnit: "piece" }]);
    expect((await worksheetLine(ctx)).saleUnit).toBe("piece");
  });
});

describe("la fiche d'atelier, au poids", () => {
  it("sert la ligne en grammes, et la compte pour une pièce dans le rayon", async () => {
    await mixedDay();

    const line = await worksheetLine(ctx, WEIGHED);
    expect(line).toMatchObject({ quantity: 1750, saleUnit: "weight", remaining: 1750 });
    const view = jsonBody<ProductionWorksheetView>(
      await ctx.asSub(STAFF).get(`/admin/production/worksheet?date=${SERVICE_DAY}`).expect(200),
    );
    const group = view.groups.find((candidate) => candidate.lines.some((l) => l.sku === WEIGHED));
    expect(group?.totalUnits).toBe(13);
  });

  it("une fournée se déclare en grammes, et complète la ligne au poids", async () => {
    await mixedDay();

    expect(await recordBatch(ctx, "01K6A0000000000000000000W1", 1000, WEIGHED)).toBe(204);
    expect(await worksheetLine(ctx, WEIGHED)).toMatchObject({ produced: 1000, remaining: 750 });
    expect(await recordBatch(ctx, "01K6A0000000000000000000W2", 750, WEIGHED)).toBe(204);
    expect(await worksheetLine(ctx, WEIGHED)).toMatchObject({ done: true, remaining: 0 });
  });
});

describe("le prévisionnel, au poids", () => {
  it("garde les grammes sur la ligne de l'article, et compte une pièce en colonne", async () => {
    await mixedDay();

    const view = jsonBody<ProductionForecastView>(
      await ctx
        .asSub(STAFF)
        .get(`/admin/production/forecast?from=${SERVICE_DAY}&to=${SERVICE_DAY}`)
        .expect(200),
    );
    expect(view.lines.find((line) => line.sku === WEIGHED)).toMatchObject({
      saleUnit: "weight",
      quantities: [1750],
    });
    expect(view.days[0]?.totalUnits).toBe(13);
  });
});

describe("le colisage, au poids", () => {
  async function chocolateOut(): Promise<PackingSheet> {
    const { mixed } = await mixedDay();
    expect(await recordBatch(ctx, "01K6A0000000000000000000W3", 1750, WEIGHED)).toBe(204);
    expect(await recordBatch(ctx, "01K6A0000000000000000000C1", 12)).toBe(204);
    await settle();
    return sheetOf(ctx, mixed.reference);
  }

  it("le poste sert l'unité, et compte 12 croissants et UN lot : 13 pièces", async () => {
    const sheet = await chocolateOut();

    expect(sheet.pieces).toBe(13);
    expect(sheet.lines.find((line) => line.sku === WEIGHED)).toMatchObject({
      saleUnit: "weight",
      quantity: 1250,
      unallocated: 1250,
    });
  });

  it("le lot entier se pose d'un geste, et la commande se ferme", async () => {
    const sheet = await chocolateOut();
    const bag = await openBag(sheet.orderId);

    await put(sheet.orderId, bag, WEIGHED, 1250).expect(204);
    await put(sheet.orderId, bag, CROISSANT, 12).expect(204);

    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(sheet.orderId)}/close`)
      .expect(204);
  });

  it("refuse d'éparpiller le lot dans un second sac, en le disant", async () => {
    const sheet = await chocolateOut();
    const first = await openBag(sheet.orderId);
    const second = await openBag(sheet.orderId);
    await put(sheet.orderId, first, WEIGHED, 1000).expect(204);

    const refusal = await put(sheet.orderId, second, WEIGHED, 250).expect(400);

    expect(JSON.stringify(refusal.body)).toContain("un seul lot");
  });

  it("refuse de retirer une part du lot ; le lot entier, oui", async () => {
    const sheet = await chocolateOut();
    const bag = await openBag(sheet.orderId);
    await put(sheet.orderId, bag, WEIGHED, 1250).expect(204);
    const withdraw = (quantity: number) =>
      ctx
        .asSub(STAFF)
        .post(`${packingOrderPath(sheet.orderId)}/containers/${bag}/lines/${WEIGHED}/withdrawal`)
        .send({ quantity });

    await withdraw(250).expect(400);
    await withdraw(1250).expect(204);
  });

  it("un manque partiel au poids se signale en grammes, et se lit en grammes partout", async () => {
    const sheet = await chocolateOut();
    const bag = await openBag(sheet.orderId);
    await put(sheet.orderId, bag, WEIGHED, 1000).expect(204);
    await put(sheet.orderId, bag, CROISSANT, 12).expect(204);

    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(sheet.orderId)}/shortfall`)
      .expect(204);
    await settle();

    const row = await ctx.prisma.orderShortfall.findUniqueOrThrow({
      where: { orderId_rank: { orderId: sheet.orderId, rank: 1 } },
      select: { lines: true },
    });
    expect(row.lines).toEqual(expect.arrayContaining([{ sku: WEIGHED, due: 1250, packed: 1000 }]));
    const fiche = jsonBody<AdminOrderView>(
      await ctx.asSub(STAFF).get(`/admin/orders/${sheet.orderId}`).expect(200),
    );
    expect(fiche.shortfall?.lines).toEqual(
      expect.arrayContaining([
        { sku: WEIGHED, due: 1250, packed: 1000, saleUnit: "weight" },
        { sku: CROISSANT, due: 12, packed: 12, saleUnit: "piece" },
      ]),
    );
    const day = jsonBody<DaySupervisionView>(
      await ctx.asSub(STAFF).get(`/admin/supervision/day?date=${SERVICE_DAY}`).expect(200),
    );
    expect(day.awaitingDecision[0]?.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ sku: WEIGHED, saleUnit: "weight" })]),
    );
  });
});
