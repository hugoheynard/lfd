import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { BinDesk } from "../channels/delivery/index.js";
import type { PackingContainerState } from "../domain/entities/order-contents.js";
import { citeContainer } from "../domain/events/packing-container.events.js";
import {
  type BoardContainer,
  type BoardOrder,
  type BoardWithdrawnSheet,
  PackingBoardReader,
  type PackingBoardDay,
} from "../domain/ports/packing-board.reader.js";
import { reservedOf } from "../domain/services/stock-reservations.js";
import { CONTAINER_SELECT, containerModeOf, containerOf } from "./packing-container.mapper.js";
import { reservationsOn } from "./packing-stock-reservation.rows.js";

/** Ce qu'on relit d'une commande pour le poste. */
const ORDER_SELECT = {
  orderId: true,
  reference: true,
  customerLabel: true,
  fulfillmentMethod: true,
  clientele: true,
  siteId: true,
  dueAt: true,
  drawnAt: true,
  packedAt: true,
  packedBy: true,
  containerCount: true,
  containerMode: true,
  shortfallReportedAt: true,
  shortfallAuthorizedAt: true,
  withdrawnAt: true,
  containers: CONTAINER_SELECT,
  lines: {
    select: {
      sku: true,
      productName: true,
      quantity: true,
      packedAt: true,
      packedBy: true,
      packedInitials: true,
    },
    orderBy: { sku: "asc" as const },
  },
};

/**
 * Le poste d'une journée, lu dans les tables du colisage (K3a) — sans verrou.
 *
 * Défense en profondeur (K2b, §5.1, B1) : un contenant dont le bac n'est plus vivant chez la livraison n'est ni servi,
 * ni compté.
 *
 * Une feuille retirée (plan A1, lot A1.3) sort du poste : elle n'est rendue
 * qu'à part, sans lignes ni contenants — elle ne se colise plus.
 */
@Injectable()
export class PrismaPackingBoardReader extends PackingBoardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly desk: BinDesk,
  ) {
    super();
  }

  async dayOf(serviceDay: string): Promise<PackingBoardDay> {
    const [orders, stocks, reservations] = await Promise.all([
      this.prisma.packingOrder.findMany({
        where: { serviceDay },
        select: ORDER_SELECT,
        orderBy: [{ drawnAt: "asc" }, { orderId: "asc" }],
      }),
      this.prisma.packingStock.findMany({
        where: { serviceDay },
        select: { sku: true, received: true, returned: true, packed: true },
        orderBy: { sku: "asc" },
      }),
      reservationsOn(this.prisma, serviceDay),
    ]);
    const active = orders.filter((order) => order.withdrawnAt === null);
    const liveBins = await this.desk.liveBins(
      active.flatMap((order) => order.containers.flatMap((row) => row.binId ?? [])),
    );
    return {
      orders: active.map((row) => boardOrderOf(row, liveBins)),
      withdrawn: orders.flatMap(withdrawnSheetOf),
      stocks: stocks.map((stock) => ({
        ...stock,
        reserved: reservedOf(reservations.get(stock.sku) ?? []),
      })),
    };
  }
}

/** Une ligne de `packing_order`, telle que `ORDER_SELECT` la relit. */
interface OrderRow {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: string;
  readonly clientele: string | null;
  readonly siteId: string | null;
  readonly dueAt: string | null;
  readonly drawnAt: Date;
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly containerCount: number;
  readonly containerMode: string;
  readonly shortfallReportedAt: Date | null;
  readonly shortfallAuthorizedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly containers: Parameters<typeof containerOf>[0][];
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
    readonly packedAt: Date | null;
    readonly packedBy: string | null;
    readonly packedInitials: string;
  }[];
}

function boardOrderOf(row: OrderRow, liveBins: ReadonlySet<string>): BoardOrder {
  const mode = containerModeOf(row.containerMode);
  const all = row.containers.map(containerOf);
  const live = all.filter((container) => isLive(container, liveBins));
  return {
    orderId: row.orderId,
    reference: row.reference,
    customerLabel: row.customerLabel,
    // Même lecture que le dépôt des bacs (`PrismaPackingSheetRepository`).
    fulfillmentMethod: row.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
    // Le CHECK de la table n'admet que ces deux valeurs, ou `NULL`.
    clientele: row.clientele === "pro" || row.clientele === "public" ? row.clientele : null,
    siteId: row.siteId,
    dueAt: row.dueAt,
    drawnAt: row.drawnAt,
    // Les CHECK de la table tiennent `packed_at` et `packed_by` ensemble.
    packed:
      row.packedAt === null || row.packedBy === null
        ? null
        : { at: row.packedAt, by: row.packedBy },
    containers: mode === "listed" ? live.length : row.containerCount,
    containerMode: mode,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      packed:
        line.packedAt === null || line.packedBy === null
          ? null
          : { at: line.packedAt, by: line.packedBy, initials: line.packedInitials },
    })),
    containerList: live.map((container) => boardContainerOf(container, all)),
    shortfallReportedAt: row.shortfallReportedAt,
    shortfallAuthorizedAt: row.shortfallAuthorizedAt,
  };
}

function withdrawnSheetOf(row: OrderRow): BoardWithdrawnSheet[] {
  return row.withdrawnAt === null
    ? []
    : [
        {
          orderId: row.orderId,
          reference: row.reference,
          customerLabel: row.customerLabel,
          drawnAt: row.drawnAt,
          withdrawnAt: row.withdrawnAt,
        },
      ];
}

function isLive(container: PackingContainerState, liveBins: ReadonlySet<string>): boolean {
  return container.voided === null && (container.bin === null || liveBins.has(container.bin.binId));
}

function boardContainerOf(
  container: PackingContainerState,
  all: readonly PackingContainerState[],
): BoardContainer {
  return {
    id: container.id,
    nature: container.nature,
    label: citeContainer(all, container.id).name,
    bin: container.bin,
    lines: container.lines.filter((line) => line.quantity > 0),
  };
}
