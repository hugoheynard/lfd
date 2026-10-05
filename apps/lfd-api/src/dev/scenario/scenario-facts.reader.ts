import type { PrismaClient } from "../../platform/database/client/client.js";
import { COUNTER } from "../seeding/counter-day.seed.js";
import { DELIVERY_DAY } from "../seeding/delivery-day.seed.js";
import { placedByKeys, scenarioOrderKey } from "../seeding/scenario-keys.seed.js";
import type { ScenarioFacts } from "./scenario-progress.js";

/** Une commande que le scénario pose aujourd'hui : sa clé, son mode, et si elle doit finir prête. */
interface ExpectedOrder {
  readonly key: string;
  readonly delivery: boolean;
  readonly ready: boolean;
  /** Le scénario la met en tournée (Val d'Isère, ou prête ailleurs). */
  readonly routed: boolean;
}

/** Les commandes du jour que le scénario pose, dans l'ordre de la file puis de la livraison. */
function expectedOrders(forDay: string): readonly ExpectedOrder[] {
  return [
    ...COUNTER.map((entry, rank) => ({
      key: scenarioOrderKey(forDay, "counter", rank),
      delivery: entry.point === null,
      ready: entry.outcome !== "expected",
      routed: entry.point === null,
    })),
    ...DELIVERY_DAY.map((entry, rank) => ({
      key: scenarioOrderKey(forDay, "delivery", rank),
      delivery: true,
      ready: entry.ready,
      routed: entry.stop !== null || entry.ready,
    })),
  ];
}

/**
 * **Lit en base ce que la journée du scénario porte** — les faits dont
 * `reachedStep` déduit l'étape atteinte. Rien n'est mémorisé à côté : les
 * commandes sont retrouvées par leur clé de passation, le reste par la journée.
 */
export async function readScenarioFacts(
  prisma: PrismaClient,
  forDay: string,
): Promise<ScenarioFacts> {
  const expected = expectedOrders(forDay);
  const placed = await placedByKeys(
    prisma,
    expected.map((order) => order.key),
  );
  const found = expected.filter((order) => placed.has(order.key));
  const toPack = found.flatMap((order) => (order.ready ? [placed.get(order.key)?.id ?? ""] : []));
  return {
    placed: {
      expected: expected.length,
      found: found.length,
      deliveries: found.filter((order) => order.delivery).length,
      pickups: found.filter((order) => !order.delivery).length,
    },
    plan: await readPlan(prisma, forDay),
    composed: await readComposed(
      prisma,
      forDay,
      expected.filter((order) => order.routed).map((order) => placed.get(order.key)?.id ?? ""),
    ),
    production: await readProduction(prisma, forDay),
    packing: {
      expected: toPack.length,
      packed: await prisma.packingOrder.count({
        where: { serviceDay: forDay, orderId: { in: toPack }, packedAt: { not: null } },
      }),
      left: found.length - toPack.length,
    },
    rounds: await readRounds(prisma, forDay),
  };
}

async function readPlan(prisma: PrismaClient, forDay: string): Promise<ScenarioFacts["plan"]> {
  const day = await prisma.productionDay.findUnique({
    where: { serviceDay: forDay },
    select: { closedAt: true },
  });
  return {
    closed: day?.closedAt !== null && day?.closedAt !== undefined,
    orders: await prisma.productionOrder.count({ where: { serviceDay: forDay } }),
  };
}

/** Les livraisons à router, et celles qui sont un arrêt vivant d'une tournée du jour. */
async function readComposed(
  prisma: PrismaClient,
  forDay: string,
  routed: readonly string[],
): Promise<ScenarioFacts["composed"]> {
  const assigned = await prisma.deliveryRoundStop.count({
    where: { serviceDay: forDay, removedAt: null, orderId: { in: [...routed] } },
  });
  return { expected: routed.length, assigned };
}

/** Un article est « sorti » quand ses fournées non annulées couvrent son compte. */
async function readProduction(
  prisma: PrismaClient,
  forDay: string,
): Promise<ScenarioFacts["production"]> {
  const counts = await prisma.productionCount.findMany({
    where: { serviceDay: forDay },
    select: { sku: true, quantity: true },
  });
  const batches = await prisma.productionBatch.groupBy({
    by: ["sku"],
    where: { serviceDay: forDay, cancelledAt: null },
    _sum: { quantity: true },
  });
  const baked = new Map(batches.map((batch) => [batch.sku, batch._sum.quantity ?? 0]));
  return {
    items: counts.length,
    done: counts.filter((item) => (baked.get(item.sku) ?? 0) >= item.quantity).length,
  };
}

/** Les bacs vivants des arrêts vivants des tournées du jour, et ceux qui sont chargés. */
async function readRounds(prisma: PrismaClient, forDay: string): Promise<ScenarioFacts["rounds"]> {
  const rounds = await prisma.deliveryRound.count({ where: { serviceDay: forDay } });
  const stops = await prisma.deliveryRoundStop.findMany({
    where: { serviceDay: forDay, removedAt: null },
    select: { orderId: true },
  });
  const bins = await prisma.deliveryBin.findMany({
    where: { orderId: { in: stops.map((stop) => stop.orderId) }, voidedAt: null },
    select: { id: true },
  });
  const loaded = await prisma.deliveryBinLoad.findMany({
    where: {
      serviceDay: forDay,
      loadedAt: { not: null },
      binId: { in: bins.map((bin) => bin.id) },
    },
    select: { binId: true },
    distinct: ["binId"],
  });
  return { rounds, bins: bins.length, loaded: loaded.length };
}
