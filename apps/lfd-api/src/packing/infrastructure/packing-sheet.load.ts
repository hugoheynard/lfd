import type { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingSheet, type SheetLine } from "../domain/entities/packing-sheet.js";
import { CONTAINER_SELECT, containerModeOf, containerOf } from "./packing-container.mapper.js";
import { packingSaleUnitOf } from "./sale-unit.column.js";

/** Une ligne de `packing_line`, telle qu'on la relit. */
interface LineRow {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  /** `TEXT` contraint (`packing_line_sale_unit_check`). */
  readonly saleUnit: string;
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly packedInitials: string;
}

function lineOf(row: LineRow): SheetLine {
  return {
    sku: row.sku,
    productName: row.productName,
    quantity: row.quantity,
    saleUnit: packingSaleUnitOf(row.sku, row.saleUnit),
    // Le CHECK de la table interdit l'un sans l'autre.
    packed:
      row.packedAt === null || row.packedBy === null
        ? null
        : { at: row.packedAt, by: row.packedBy, initials: row.packedInitials },
  };
}

/**
 * **La feuille d'un envoi, relue SANS verrou** — le chargement que partagent
 * le dépôt (qui pose `FOR UPDATE` d'abord) et les lectures du colisage (un
 * aperçu, pas une promesse : le geste relit sous verrou). Extrait le
 * 2026-11-03 pour la lecture « éligibilité » du départ incomplet (C1b).
 *
 * @returns `null` si la liste à coliser n'a pas inscrit cet envoi ce jour-là.
 */
export async function loadPackingSheet(
  prisma: PrismaService,
  serviceDay: string,
  orderId: string,
  rank: number,
): Promise<PackingSheet | null> {
  const row = await prisma.packingOrder.findUnique({
    where: { serviceDay_orderId_rank: { serviceDay, orderId, rank } },
    select: {
      reference: true,
      packedAt: true,
      packedBy: true,
      containerCount: true,
      containerMode: true,
      fulfillmentMethod: true,
      shortfallReportedAt: true,
      shortfallAuthorizedAt: true,
      withdrawnAt: true,
      containers: CONTAINER_SELECT,
      lines: {
        select: {
          sku: true,
          productName: true,
          quantity: true,
          saleUnit: true,
          packedAt: true,
          packedBy: true,
          packedInitials: true,
        },
        orderBy: { sku: "asc" },
      },
    },
  });
  if (row === null) {
    return null;
  }
  return PackingSheet.fromSnapshot({
    serviceDay,
    orderId,
    rank,
    reference: row.reference,
    packed:
      row.packedAt === null || row.packedBy === null
        ? null
        : { at: row.packedAt, by: row.packedBy },
    containers: row.containerCount,
    lines: row.lines.map(lineOf),
    containerMode: containerModeOf(row.containerMode),
    containerList: row.containers.map(containerOf),
    fulfillmentMethod: row.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
    shortfallReportedAt: row.shortfallReportedAt,
    shortfallAuthorizedAt: row.shortfallAuthorizedAt,
    withdrawnAt: row.withdrawnAt,
  });
}

/** Le jour de la feuille la plus récente d'un envoi, sans verrou ; `null` s'il n'en a pas. */
export async function latestServiceDayOf(
  prisma: PrismaService,
  orderId: string,
  rank: number,
): Promise<string | null> {
  const latest = await prisma.packingOrder.findFirst({
    where: { orderId, rank },
    orderBy: { serviceDay: "desc" },
    select: { serviceDay: true },
  });
  return latest?.serviceDay ?? null;
}
