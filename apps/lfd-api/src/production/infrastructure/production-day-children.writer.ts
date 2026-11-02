import type { Prisma } from "../../platform/database/client/client.js";
import type { ProductionDay } from "../domain/entities/production-day.js";
import { carriedKey, type CarriedPacking } from "./production-day-carried-packing.js";
import { sheetRowOf } from "./production-order-sheet.columns.js";
import { resupplyLineRowsOf, resupplyRowOf } from "./production-resupply.columns.js";

type DaySnapshot = ReturnType<ProductionDay["toSnapshot"]>;
type OrderSnapshot = DaySnapshot["orders"][number];

/**
 * **Les enfants de la journée, écrits en lots** (M-A, audit du réassort,
 * 2026-11-02) : les commandes en une requête qui rend leurs identifiants,
 * leurs lignes en une autre, de même pour les réassorts, le compte en une —
 * cinq requêtes au plus, quel que soit le nombre de commandes et de
 * réassorts. Jusque-là, une `create` imbriquée par commande et par
 * réassort, sous `FOR UPDATE`.
 *
 * À appeler dans la transaction de `save`, APRÈS l'effacement des anciens
 * enfants : ils sont remplacés, pas fusionnés.
 */
export async function writeDayChildren(
  tx: Prisma.TransactionClient,
  snapshot: DaySnapshot,
  carried: CarriedPacking,
): Promise<void> {
  await writeOrders(tx, snapshot, carried);
  await writeResupplies(tx, snapshot);
  if (snapshot.counts.length > 0) {
    await tx.productionCount.createMany({
      data: snapshot.counts.map((count) => ({
        serviceDay: snapshot.serviceDay,
        sku: count.sku,
        productName: count.productName,
        quantity: count.quantity,
        saleUnit: count.saleUnit,
      })),
    });
  }
}

/** Les réassorts, puis leurs lignes rattachées par l'identifiant du réassort. */
async function writeResupplies(tx: Prisma.TransactionClient, snapshot: DaySnapshot): Promise<void> {
  const resupplies = [...(snapshot.resupplies ?? []), ...(snapshot.launchedResupplies ?? [])];
  if (resupplies.length === 0) {
    return;
  }
  const written = await tx.productionResupply.createManyAndReturn({
    data: resupplies.map((resupply) => ({
      serviceDay: snapshot.serviceDay,
      ...resupplyRowOf(resupply),
    })),
    select: { id: true, resupplyId: true },
  });
  const idOf = new Map(written.map((row) => [row.resupplyId, row.id]));
  const lines = resupplies.flatMap((resupply) => {
    const parent = idOf.get(resupply.resupplyId);
    return parent === undefined ? [] : resupplyLineRowsOf(parent, resupply);
  });
  if (lines.length > 0) {
    await tx.productionResupplyLine.createMany({ data: lines });
  }
}

/** Les commandes, puis leurs lignes rattachées par (commande, rang). */
async function writeOrders(
  tx: Prisma.TransactionClient,
  snapshot: DaySnapshot,
  carried: CarriedPacking,
): Promise<void> {
  if (snapshot.orders.length === 0) {
    return;
  }
  const written = await tx.productionOrder.createManyAndReturn({
    data: snapshot.orders.map((order) => orderRowOf(snapshot.serviceDay, order, carried)),
    select: { id: true, orderId: true, rank: true },
  });
  const idOf = new Map(written.map((row) => [carriedKey(row.orderId, row.rank), row.id]));
  const lines = snapshot.orders.flatMap((order) => {
    const key = carriedKey(order.orderId, order.rank);
    const parent = idOf.get(key);
    return parent === undefined
      ? []
      : order.lines.map((line) => lineRowOf(parent, key, line, carried));
  });
  if (lines.length > 0) {
    await tx.productionOrderLine.createMany({ data: lines });
  }
}

function orderRowOf(serviceDay: string, order: OrderSnapshot, carried: CarriedPacking) {
  return {
    serviceDay,
    orderId: order.orderId,
    rank: order.rank,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    dueAt: order.dueAt,
    clientele: order.clientele,
    siteId: order.siteId,
    ...sheetRowOf(order.sheetDetails),
    ...carried.orders.get(carriedKey(order.orderId, order.rank)),
  };
}

function lineRowOf(
  parent: string,
  key: string,
  line: OrderSnapshot["lines"][number],
  carried: CarriedPacking,
) {
  return {
    orderId: parent,
    sku: line.sku,
    productName: line.productName,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    // `NULL` écrit tel quel : « on ne savait pas » ne devient pas « non » en
    // traversant (plan `plan-sur-mesure-partout.md`, M2).
    madeToOrder: line.madeToOrder ?? null,
    ...carried.lines.get(`${key}/${line.sku}`),
  };
}
