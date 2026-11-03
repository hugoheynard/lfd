import type { Prisma } from "../../platform/database/client/client.js";
import type { ProductionDaySnapshot } from "../domain/entities/production-day.js";
import { BATCH_COLUMNS, batchOf, returnsByBatch } from "./prisma-production-batch.repository.js";
import { signerOf } from "./production-day-signer.columns.js";
import { SHEET_COLUMNS, clienteleOf, sheetDetailsOf } from "./production-order-sheet.columns.js";
import { RESUPPLY_COLUMNS, splitResupplies } from "./production-resupply.columns.js";
import { productionSaleUnitOf } from "./sale-unit.column.js";

/**
 * Les colonnes d'une journée de production et de ses enfants, et leur mapper
 * vers l'instantané de l'agrégat — sortis de `PrismaProductionDayRepository`
 * pour que chacun tienne en une fonction courte (2026-11-02).
 */
export const DAY_COLUMNS = {
  serviceDay: true,
  closedAt: true,
  retakenAt: true,
  retakenBy: true,
  reopenedAt: true,
  reopenedBy: true,
  closedBy: true,
  closedByName: true,
  retakenByName: true,
  packingOwner: true,
  orders: {
    select: {
      orderId: true,
      rank: true,
      reference: true,
      customerLabel: true,
      fulfillmentMethod: true,
      destination: true,
      dueAt: true,
      clientele: true,
      siteId: true,
      ...SHEET_COLUMNS,
      lines: {
        select: {
          sku: true,
          productName: true,
          quantity: true,
          saleUnit: true,
          madeToOrder: true,
        },
        orderBy: { id: "asc" },
      },
    },
    // Ordonnées : sans `orderBy`, Postgres rend l'ordre physique, qui change
    // après un `UPDATE` (audit final du réassort, 2026-11-03). Par `id` —
    // un cuid tiré dans l'ordre d'écriture — pour garder l'ordre de
    // l'agrégat que les papiers servent : un tri par SKU ou par commande
    // inversait les lignes du dossier (e2e `resupply-village-flow`).
    orderBy: { id: "asc" },
  },
  // Les réassorts figés à l'arrêt du soir et les « au plus tôt » lancés dans
  // la journée — à part des commandes.
  resupplies: RESUPPLY_COLUMNS,
  counts: {
    select: {
      sku: true,
      productName: true,
      quantity: true,
      saleUnit: true,
      doneAt: true,
      doneBy: true,
      doneInitials: true,
    },
    orderBy: { sku: "asc" },
  },
  // Annulées comprises : « aucune fournée » (qui décide d'une fournée
  // implicite, §5.2 des fournées) se lit annulées comprises.
  batches: { select: BATCH_COLUMNS, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] },
  // Les retours demandés au colisage (K2) : ce qu'il a rendu, ce qui attend.
  returns: {
    select: { batchId: true, quantity: true, returned: true },
    orderBy: [{ batchId: "asc" }, { requestId: "asc" }],
  },
} satisfies Prisma.ProductionDaySelect;

/** Une journée telle que `DAY_COLUMNS` la rend. */
export type DayRow = Prisma.ProductionDayGetPayload<{ select: typeof DAY_COLUMNS }>;

/** Ligne → instantané ; les value objects revalident à la réhydratation. */
export function daySnapshotOf(row: DayRow): ProductionDaySnapshot {
  const returns = returnsByBatch(row.returns);
  return {
    serviceDay: row.serviceDay,
    closedAt: row.closedAt,
    closedBy: signerOf(row.closedBy, row.closedByName),
    retakenByName: row.retakenByName,
    // Les deux colonnes sont nullables : le mapper les recolle en un couple,
    // ou en `null` — l'agrégat ne connaît pas l'état où l'instant existe
    // sans son auteur.
    retaken:
      row.retakenAt === null || row.retakenBy === null
        ? null
        : { at: row.retakenAt, by: row.retakenBy },
    // Même couple que `retaken`, pour la même raison.
    reopened:
      row.reopenedAt === null || row.reopenedBy === null
        ? null
        : { at: row.reopenedAt, by: row.reopenedBy },
    // Le CHECK de la base n'admet que ces deux valeurs.
    packingOwner: row.packingOwner === "packing" ? "packing" : "legacy",
    orders: row.orders.map(orderOf),
    ...splitResupplies(row.resupplies),
    counts: row.counts.map(countOf),
    batches: row.batches.map((batch) => batchOf(batch, returns.get(batch.id))),
  };
}

/** Une commande au plan, ligne → instantané. */
function orderOf(order: DayRow["orders"][number]): ProductionDaySnapshot["orders"][number] {
  return {
    // Le colisage n'est plus lu ici depuis K3c (§17.3) : c'est le colisage
    // qui le tient, et `SealedDayReading` le pose en lecture.
    packed: null,
    orderId: order.orderId,
    rank: order.rank,
    reference: order.reference,
    customerLabel: order.customerLabel,
    // Le mode d'acheminement est un mot du domaine, pas une colonne : on le
    // ramène dans son union plutôt que de laisser une `string` circuler.
    fulfillmentMethod: order.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
    destination: order.destination,
    dueAt: order.dueAt,
    clientele: clienteleOf(order.clientele),
    siteId: order.siteId,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      saleUnit: productionSaleUnitOf(line.sku, line.saleUnit),
      madeToOrder: line.madeToOrder,
    })),
    sheetDetails: sheetDetailsOf(order),
  };
}

/** Une ligne du compte à produire, ligne → instantané. */
function countOf(count: DayRow["counts"][number]): ProductionDaySnapshot["counts"][number] {
  return {
    sku: count.sku,
    productName: count.productName,
    quantity: count.quantity,
    saleUnit: productionSaleUnitOf(count.sku, count.saleUnit),
    // `doneAt` seul décide : c'est la colonne nullable, et les initiales ont
    // un défaut vide. Une ligne faite sans signature reste une ligne faite.
    done:
      count.doneAt === null || count.doneBy === null
        ? null
        : { at: count.doneAt, by: count.doneBy, initials: count.doneInitials },
  };
}
