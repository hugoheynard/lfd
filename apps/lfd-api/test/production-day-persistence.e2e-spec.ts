import type { PlacedResupply, ProducibleOrder } from "../src/production/channels/commerce/index.js";
import {
  NOTHING_PENDING,
  ProductionDay,
  type ProductionDaySnapshot,
} from "../src/production/domain/entities/production-day.js";
import { ProductionDayRepository } from "../src/production/domain/ports/production-day.repository.js";
import { ServiceDay } from "../src/production/domain/value-objects/service-day.value-object.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * **La journée de production, écrite par différence** (audit du réassort,
 * 2026-11-02) : chaque geste n'écrit que ce qu'il touche, et la journée
 * relue est celle qui a été écrite. Les identifiants des lignes que le geste
 * ne touche pas restent les mêmes — c'est ce qui prouve qu'elles n'ont pas
 * été effacées puis recréées. Instants recopiés, jamais comparés à l'horloge.
 */

const SERVICE_DAY = serviceDay();
const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const NONE = new Set<string>();

function order(orderId: string, quantity = 4): ProducibleOrder {
  return {
    orderId,
    reference: `REF-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [
      { sku: "VIE-001", productName: "Croissant", quantity, saleUnit: "piece", madeToOrder: null },
    ],
  };
}

function resupply(resupplyId: string, quantity = 6): PlacedResupply {
  return {
    resupplyId,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity, saleUnit: "piece" }],
  };
}

/** L'état comparable : les commandes dans un ordre stable, la base ne le garantit pas. */
function comparable(day: ProductionDay): ProductionDaySnapshot {
  const snapshot = day.toSnapshot();
  const orders = [...snapshot.orders].sort((a, b) => a.orderId.localeCompare(b.orderId));
  return { ...snapshot, orders };
}

describe("La journée de production — écrite par différence, relue telle quelle", () => {
  let ctx: E2eContext;
  let days: ProductionDayRepository;
  const day = ServiceDay.of(SERVICE_DAY);

  beforeAll(async () => {
    ctx = await bootstrapE2e();
    days = ctx.app.get(ProductionDayRepository);
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    const opened = await days.load(day);
    opened.close([order("ord_1")], NONE, EVENING, null, [resupply("rs_evening")]);
    await days.save(opened);
  });

  async function rowIds(): Promise<readonly string[]> {
    const orders = await ctx.prisma.productionOrder.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { id: true, lines: { select: { id: true } } },
    });
    const resupplies = await ctx.prisma.productionResupply.findMany({
      where: { serviceDay: SERVICE_DAY, launchedAt: null },
      select: { id: true },
    });
    return [
      ...orders.flatMap((row) => [row.id, ...row.lines.map((line) => line.id)]),
      ...resupplies.map((row) => row.id),
    ].sort();
  }

  it("l'arrêt se relit tel qu'il a été écrit", async () => {
    const reloaded = await days.load(day);

    expect(reloaded.orders.map((o) => o.orderId)).toEqual(["ord_1"]);
    expect(reloaded.resupplies.map((r) => r.resupplyId)).toEqual(["rs_evening"]);
    expect(reloaded.counts.map((c) => [c.sku, c.quantity])).toEqual([["VIE-001", 10]]);
  });

  it("le retirage ajoute la commande arrivée sans réécrire celles du plan", async () => {
    const before = await rowIds();
    const current = await days.load(day);

    current.retake([order("ord_1"), order("ord_2", 3)], NONE, MORNING, "s_max", "Max");
    await days.save(current);

    expect(comparable(await days.load(day))).toEqual(comparable(current));
    expect(await rowIds()).toEqual(expect.arrayContaining([...before]));
  });

  it("le lancement « au plus tôt » n'écrit que ce réassort ; le plan du soir garde ses lignes", async () => {
    const before = await rowIds();
    const current = await days.load(day);

    current.launchResupply(
      resupply("rs_asap", 8),
      { at: MORNING, staffUserId: "s_max", name: "Max" },
      NOTHING_PENDING,
    );
    await days.save(current);

    expect(comparable(await days.load(day))).toEqual(comparable(current));
    expect(await rowIds()).toEqual(before);
  });

  it("la révision change la quantité due sans recréer la commande", async () => {
    const before = await rowIds();
    const current = await days.load(day);

    current.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 9 }]);
    await days.save(current);

    const reloaded = await days.load(day);
    expect(comparable(reloaded)).toEqual(comparable(current));
    expect(reloaded.orders[0]?.lines[0]?.quantity).toBe(9);
    expect(await rowIds()).toEqual(before);
  });

  /**
   * Régression (audit du réassort, 2026-11-02) : `updateMany` ne contrôlait pas
   * ce qu'il touchait. Une ligne absente en base laissait la révision perdue
   * sans un mot — la journée en mémoire disait 9, la base 4, le compte montait.
   */
  it("une révision dont la ligne manque en base échoue, et rien n'est écrit", async () => {
    await ctx.prisma.productionOrderLine.deleteMany({
      where: { order: { serviceDay: SERVICE_DAY } },
    });
    const current = await days.load(day);
    expect(current.orders[0]?.lines).toEqual([]);
    // L'agrégat porte encore la ligne que la base a perdue — la dérive à révéler.
    const revising = ProductionDay.restore({
      ...current.toSnapshot(),
      orders: current.orders.map((o) => ({
        ...o,
        lines: order("ord_1").lines.map((l) => ({ ...l })),
      })),
    });

    revising.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 9 }]);

    await expect(days.save(revising)).rejects.toMatchObject({
      code: "production.revision.not_written",
    });
    const reloaded = await days.load(day);
    expect(reloaded.counts.map((c) => [c.sku, c.quantity])).toEqual([["VIE-001", 10]]);
  });

  it("la réouverture efface le plan du soir et garde le réassort lancé", async () => {
    const launching = await days.load(day);
    launching.launchResupply(
      resupply("rs_asap", 8),
      { at: MORNING, staffUserId: "s_max", name: "Max" },
      NOTHING_PENDING,
    );
    await days.save(launching);
    const current = await days.load(day);

    current.reopen({ packingStarted: false, dispatchStarted: false }, MORNING, "s_max");
    await days.save(current);

    const reloaded = await days.load(day);
    expect(comparable(reloaded)).toEqual(comparable(current));
    expect(reloaded.orders).toEqual([]);
    expect(reloaded.resupplies).toEqual([]);
    expect(reloaded.launchedResupplies.map((r) => r.resupplyId)).toEqual(["rs_asap"]);
  });

  /** Les colonnes de l'ancien poste ne sont écrites par aucun geste : posées à la main, comme une journée d'avant la bascule. */
  it("une commande que le geste ne touche pas garde le colisage de l'ancien poste", async () => {
    await ctx.prisma.productionOrder.updateMany({
      where: { serviceDay: SERVICE_DAY, orderId: "ord_1" },
      data: { packedAt: EVENING, packedBy: "s_old", containerCount: 2 },
    });
    const current = await days.load(day);

    current.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null);
    await days.save(current);

    const kept = await ctx.prisma.productionOrder.findFirst({
      where: { serviceDay: SERVICE_DAY, orderId: "ord_1" },
      select: { packedAt: true, packedBy: true, containerCount: true },
    });
    expect(kept).toEqual({ packedAt: EVENING, packedBy: "s_old", containerCount: 2 });
  });
});
