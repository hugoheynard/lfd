import type { Prisma } from "../../platform/database/client/client.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import type {
  LaunchedResupplySnapshot,
  ProductionDay,
  ProductionResupplySnapshot,
} from "../domain/entities/production-day.js";
import {
  carriedKey,
  carriedPacking,
  type CarriedPacking,
} from "./production-day-carried-packing.js";
import { sheetRowOf } from "./production-order-sheet.columns.js";
import { resupplyLineRowsOf, resupplyRowOf } from "./production-resupply.columns.js";

type DaySnapshot = ReturnType<ProductionDay["toSnapshot"]>;
type DayChanges = ProductionDay["changes"];
type OrderSnapshot = DaySnapshot["orders"][number];
type ResupplySnapshot = ProductionResupplySnapshot | LaunchedResupplySnapshot;

/** Le genre des réassorts du soir — cf. `production-resupply.columns.ts`. */
const EVENING_RESUPPLY = { launchedAt: null } as const;

/**
 * **Les enfants de la journée, écrits PAR DIFFÉRENCE** (audit du réassort,
 * 2026-11-02) : n'écrit que ce que l'agrégat dit avoir touché
 * (`ProductionDay.changes`). Coût par geste, sous le `FOR UPDATE` de `save` :
 *
 * | Geste                            | Écrit                                              |
 * | -------------------------------- | -------------------------------------------------- |
 * | arrêt, réouverture               | le plan du soir (commandes, réassorts du soir) + compte |
 * | retirage                         | les commandes arrivées + compte                    |
 * | lancement « au plus tôt »        | ce réassort + compte                               |
 * | révision d'une commande inscrite | les quantités de ses lignes + compte               |
 * | journée de base inconnue         | tout, comme avant                                  |
 *
 * Le compte (une ligne par article) est remplacé quand il a changé : il est
 * petit, et `floorCounts` le refait en entier. Les écritures restent EN LOTS
 * (une requête par table, quel que soit le nombre de commandes) ; seule la
 * révision écrit ligne à ligne, et elle ne touche qu'une commande.
 *
 * À appeler dans la transaction de `save`, sous le verrou de la journée.
 */
export async function writeDayChanges(
  tx: Prisma.TransactionClient,
  snapshot: DaySnapshot,
  changes: DayChanges,
): Promise<void> {
  if (changes.whole) {
    await replaceWholeDay(tx, snapshot);
    return;
  }
  if (changes.plan) {
    await replaceEveningPlan(tx, snapshot);
  } else {
    await writeOrders(tx, snapshot.serviceDay, ordersIn(snapshot, changes.addedOrders), NO_CARRY);
    await writeRevisions(tx, snapshot.serviceDay, ordersIn(snapshot, changes.revisedOrders));
  }
  const launched = (snapshot.launchedResupplies ?? []).filter((resupply) =>
    changes.launched.includes(resupply.resupplyId),
  );
  await writeResupplies(tx, snapshot.serviceDay, launched);
  if (changes.counts) {
    await replaceCounts(tx, snapshot);
  }
}

/** Rien à recopier : des commandes qui n'ont encore jamais été écrites. */
const NO_CARRY: CarriedPacking = { orders: new Map(), lines: new Map() };

function ordersIn(snapshot: DaySnapshot, orderIds: readonly string[]): readonly OrderSnapshot[] {
  return snapshot.orders.filter((order) => orderIds.includes(order.orderId));
}

/**
 * Base inconnue : tout effacer, puis tout réécrire. Le colisage de l'ancien
 * poste est relu AVANT l'effacement pour être recopié (cf. `carriedPacking`).
 */
async function replaceWholeDay(tx: Prisma.TransactionClient, snapshot: DaySnapshot) {
  const serviceDay = snapshot.serviceDay;
  const carried = await carriedPacking(tx, serviceDay);
  await tx.productionOrder.deleteMany({ where: { serviceDay } });
  await tx.productionResupply.deleteMany({ where: { serviceDay } });
  await writeOrders(tx, serviceDay, snapshot.orders, carried);
  await writeResupplies(tx, serviceDay, [
    ...(snapshot.resupplies ?? []),
    ...(snapshot.launchedResupplies ?? []),
  ]);
  await replaceCounts(tx, snapshot);
}

/**
 * Le plan du soir remplacé (arrêt, réouverture) : commandes et réassorts du
 * soir. Les réassorts LANCÉS restent — une réouverture les garde.
 */
async function replaceEveningPlan(tx: Prisma.TransactionClient, snapshot: DaySnapshot) {
  const serviceDay = snapshot.serviceDay;
  const carried = await carriedPacking(tx, serviceDay);
  await tx.productionOrder.deleteMany({ where: { serviceDay } });
  await tx.productionResupply.deleteMany({ where: { serviceDay, ...EVENING_RESUPPLY } });
  await writeOrders(tx, serviceDay, snapshot.orders, carried);
  await writeResupplies(tx, serviceDay, snapshot.resupplies ?? []);
}

/**
 * Le compte à produire, remplacé : il naît sans coche (`done_*` n'est plus écrit).
 *
 * ⚠️ Effacer le compte efface les coches de l'ancien poste (`done_*`) qu'il
 * portait. Ce n'est sans perte qu'à une condition : **qu'aucune coche vivante
 * ne soit sous le compte effacé**. Elle tient pour chaque geste qui le
 * remplace (vérifié le 2026-11-02) — le retirage, le lancement « au plus
 * tôt » et la révision matérialisent d'abord les coches en fournées
 * (`ProductionDay.materialize`, écrites par `recordInherited`) ; l'arrêt part
 * d'une journée ouverte, dont le compte est vide ; la réouverture refuse une
 * journée cochée (`assertReopenable`). Un nouveau geste qui refait le compte
 * doit matérialiser AVANT, ou cette fonction efface une coche en silence.
 * Une journée `fromSnapshot` (base inconnue) n'a aucun appelant qui l'écrive.
 */
async function replaceCounts(tx: Prisma.TransactionClient, snapshot: DaySnapshot) {
  await tx.productionCount.deleteMany({ where: { serviceDay: snapshot.serviceDay } });
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

/**
 * La quantité due révisée, ligne à ligne : la révision garde les mêmes
 * articles (`revisedPlanOf`), seule la quantité change. La ligne garde son
 * identifiant et son colisage de l'ancien poste — rien à recopier.
 *
 * Chaque écriture doit toucher UNE ligne, exactement (clé : jour, commande,
 * rang, article). Zéro — une ligne absente en base alors que l'agrégat la
 * porte —, et la révision était perdue sans un mot : la journée en mémoire
 * disait le dû révisé, la base l'ancien (audit du réassort, 2026-11-02).
 *
 * @throws {RevisionNotWrittenError} une ligne révisée n'a pas été trouvée.
 */
async function writeRevisions(
  tx: Prisma.TransactionClient,
  serviceDay: string,
  orders: readonly OrderSnapshot[],
): Promise<void> {
  for (const order of orders) {
    const parent = { serviceDay, orderId: order.orderId, rank: order.rank };
    for (const line of order.lines) {
      const written = await tx.productionOrderLine.updateMany({
        where: { order: parent, sku: line.sku },
        data: { quantity: line.quantity },
      });
      if (written.count !== 1) {
        throw new RevisionNotWrittenError(serviceDay, order.reference, line.sku, written.count);
      }
    }
  }
}

/** Les réassorts, puis leurs lignes rattachées par l'identifiant du réassort. */
async function writeResupplies(
  tx: Prisma.TransactionClient,
  serviceDay: string,
  resupplies: readonly ResupplySnapshot[],
): Promise<void> {
  if (resupplies.length === 0) {
    return;
  }
  const written = await tx.productionResupply.createManyAndReturn({
    data: resupplies.map((resupply) => ({
      serviceDay,
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
  serviceDay: string,
  orders: readonly OrderSnapshot[],
  carried: CarriedPacking,
): Promise<void> {
  if (orders.length === 0) {
    return;
  }
  const written = await tx.productionOrder.createManyAndReturn({
    data: orders.map((order) => orderRowOf(serviceDay, order, carried)),
    select: { id: true, orderId: true, rank: true },
  });
  const idOf = new Map(written.map((row) => [carriedKey(row.orderId, row.rank), row.id]));
  const lines = orders.flatMap((order) => {
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

/**
 * La base ne porte pas la ligne que l'agrégat révise : la transaction est
 * annulée, la révision n'est pas écrite. Un défaut de données ou de code, pas
 * un refus métier.
 */
export class RevisionNotWrittenError extends TechnicalError {
  constructor(serviceDay: string, reference: string, sku: string, count: number) {
    super(
      "production.revision.not_written",
      `La révision de la commande ${reference} (plan du ${serviceDay}) devait réécrire une ` +
        `ligne « ${sku} » au plan du fournil, et en a touché ${String(count)}. Rien n'a été ` +
        "écrit : le plan garde l'ancien dû. Signalez-le à l'équipe technique.",
    );
  }
}
