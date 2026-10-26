/**
 * Le rang de l'envoi en base, au fournil et au colisage (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 5 et 14, lot
 * L3b) : un reliquat du même jour a sa ligne de plan et sa feuille, distinctes
 * de celles de la commande, sur les mêmes clés étendues.
 *
 * Ce que seul le vrai Postgres prouve : que la clé primaire et les deux clés
 * étrangères recréées par la migration laissent coexister deux feuilles d'une
 * commande le même jour, chacune avec ses lignes, et que relire ou réécrire
 * l'une ne touche pas l'autre.
 */
import { OnPackingListDrawn } from "../src/packing/application/handlers/on-packing-list-drawn.handler.js";
import { PackingSheetRepository } from "../src/packing/domain/ports/packing-sheet.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { PackingListDrawnEvent } from "../src/production/channels/packing/index.js";
import { ProductionDay } from "../src/production/domain/entities/production-day.js";
import type { ProductionOrderSnapshot } from "../src/production/domain/entities/production-day.js";
import { ProductionDayRepository } from "../src/production/domain/ports/production-day.repository.js";
import { ServiceDay } from "../src/production/domain/value-objects/service-day.value-object.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

const SERVICE_DAY = serviceDay();
const ORDER = "ord_rank";
/** Recopié dans le fait, jamais comparé à l'horloge. */
const DRAWN = new Date("2026-10-13T03:00:00.000Z");

function drawn(rank: number, sku: string, quantity: number) {
  return new PackingListDrawnEvent(SERVICE_DAY, DRAWN, {
    orderId: ORDER,
    rank,
    reference: "ORD-0042",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    lines: [{ sku, productName: sku, quantity }],
  }).durableFact();
}

function planned(rank: number, quantity: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: ORDER,
    rank,
    reference: "ORD-0042",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity }],
  };
}

describe("Le rang de l'envoi en base — fournil et colisage (L3b)", () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await bootstrapE2e();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  it("deux feuilles d'une commande le même jour, chacune avec ses lignes, à son rang", async () => {
    const subscriber = ctx.app.get(OnPackingListDrawn);
    const first = drawn(1, "CRO", 4);
    const remainder = drawn(2, "CRO", 1);

    await subscriber.handle({ eventId: "evt_1", type: first.type, payload: first.payload });
    await subscriber.handle({ eventId: "evt_2", type: remainder.type, payload: remainder.payload });

    const rows = await ctx.prisma.packingLine.findMany({
      where: { serviceDay: SERVICE_DAY, orderId: ORDER },
      select: { rank: true, sku: true, quantity: true },
      orderBy: { rank: "asc" },
    });
    expect(rows).toEqual([
      { rank: 1, sku: "CRO", quantity: 4 },
      { rank: 2, sku: "CRO", quantity: 1 },
    ]);
  });

  it("chaque feuille se verrouille et se réécrit seule : le rang 2 ne touche pas le rang 1", async () => {
    const subscriber = ctx.app.get(OnPackingListDrawn);
    for (const fact of [drawn(1, "CRO", 4), drawn(2, "CRO", 1)]) {
      await subscriber.handle({ eventId: fact.key, type: fact.type, payload: fact.payload });
    }
    const sheets = ctx.app.get(PackingSheetRepository);
    const uow = ctx.app.get(UnitOfWork);

    const [one, two] = await uow.run(async () => {
      const remainder = await sheets.lock(SERVICE_DAY, ORDER, 2);
      if (remainder !== null) {
        await sheets.save(remainder);
      }
      return [await sheets.lock(SERVICE_DAY, ORDER, 1), remainder];
    });

    expect([one?.rank, one?.lines.map((line) => line.quantity)]).toEqual([1, [4]]);
    expect([two?.rank, two?.lines.map((line) => line.quantity)]).toEqual([2, [1]]);
  });

  it("une liste rejouée n'inscrit rien de plus, à chaque rang", async () => {
    const subscriber = ctx.app.get(OnPackingListDrawn);
    for (const fact of [drawn(1, "CRO", 4), drawn(2, "CRO", 1), drawn(2, "CRO", 1)]) {
      await subscriber.handle({ eventId: fact.key, type: fact.type, payload: fact.payload });
    }

    expect(await ctx.prisma.packingOrder.count({ where: { orderId: ORDER } })).toBe(2);
  });

  it("le plan du fournil porte deux lignes d'une commande le même jour, une par rang", async () => {
    const days = ctx.app.get(ProductionDayRepository);
    const day = ServiceDay.of(SERVICE_DAY);
    const open = ProductionDay.open(day).toSnapshot();

    await days.save(
      ProductionDay.fromSnapshot({ ...open, orders: [planned(1, 4), planned(2, 1)] }),
    );
    const reloaded = await days.load(day);

    expect(reloaded.orders.map((order) => [order.orderId, order.rank])).toEqual([
      [ORDER, 1],
      [ORDER, 2],
    ]);
  });
});
