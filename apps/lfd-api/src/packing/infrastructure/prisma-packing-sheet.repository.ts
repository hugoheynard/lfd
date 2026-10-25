import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingSheet, type SheetLine } from "../domain/entities/packing-sheet.js";
import {
  CONTAINER_SELECT,
  containerModeOf,
  containerOf,
  saveContainers,
} from "./packing-container.mapper.js";
import { PackingSheetRepository } from "../domain/ports/packing-sheet.repository.js";
import { assertInsideUnitOfWork } from "./packing-lock.js";

/** Une ligne de `packing_line`, telle qu'on la relit. */
interface LineRow {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly packedAt: Date | null;
  readonly packedBy: string | null;
  readonly packedInitials: string;
}

function lineOf(row: LineRow): SheetLine {
  return {
    sku: row.sku,
    productName: row.productName,
    quantity: row.quantity,
    // Le CHECK de la table interdit l'un sans l'autre.
    packed:
      row.packedAt === null || row.packedBy === null
        ? null
        : { at: row.packedAt, by: row.packedBy, initials: row.packedInitials },
  };
}

/**
 * L'adaptateur Prisma des bacs. `lock` pose `FOR UPDATE` sur la ligne du bac
 * par le client routé — dans l'unité de travail, le verrou tient jusqu'au
 * `COMMIT`. `save` réécrit le bac et ses lignes depuis l'agrégat.
 */
@Injectable()
export class PrismaPackingSheetRepository extends PackingSheetRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(serviceDay: string, orderId: string): Promise<PackingSheet | null> {
    assertInsideUnitOfWork(`du bac ${orderId} (${serviceDay})`);
    await this.prisma.$queryRaw`
      SELECT "order_id" FROM "packing"."packing_order"
       WHERE "service_day" = ${serviceDay} AND "order_id" = ${orderId}
         FOR UPDATE`;
    const row = await this.prisma.packingOrder.findUnique({
      where: { serviceDay_orderId: { serviceDay, orderId } },
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

  async lockLatestOf(orderId: string): Promise<PackingSheet | null> {
    assertInsideUnitOfWork(`du bac le plus récent de ${orderId}`);
    const days = await this.prisma.$queryRaw<{ service_day: string }[]>`
      SELECT "service_day" FROM "packing"."packing_order"
       WHERE "order_id" = ${orderId}
       ORDER BY "service_day" DESC
       LIMIT 1
         FOR UPDATE`;
    const day = days[0]?.service_day;
    return day === undefined ? null : this.lock(day, orderId);
  }

  async save(sheet: PackingSheet): Promise<void> {
    const snapshot = sheet.toSnapshot();
    await this.prisma.packingOrder.update({
      where: { serviceDay_orderId: { serviceDay: snapshot.serviceDay, orderId: snapshot.orderId } },
      data: {
        packedAt: snapshot.packed?.at ?? null,
        packedBy: snapshot.packed?.by ?? null,
        containerCount: snapshot.containers,
        shortfallReportedAt: snapshot.shortfallReportedAt ?? null,
        shortfallAuthorizedAt: snapshot.shortfallAuthorizedAt ?? null,
        withdrawnAt: snapshot.withdrawnAt ?? null,
      },
    });
    await saveContainers(this.prisma, snapshot);
    // Une ligne absente de l'agrégat en est sortie : décidée à zéro au départ
    // incomplet (E6b). Rien d'autre ne retire une ligne d'une fiche vivante.
    await this.prisma.packingLine.deleteMany({
      where: {
        serviceDay: snapshot.serviceDay,
        orderId: snapshot.orderId,
        sku: { notIn: snapshot.lines.map((line) => line.sku) },
      },
    });
    for (const line of snapshot.lines) {
      await this.prisma.packingLine.update({
        where: {
          serviceDay_orderId_sku: {
            serviceDay: snapshot.serviceDay,
            orderId: snapshot.orderId,
            sku: line.sku,
          },
        },
        data: {
          // La quantité due ne bouge que par la décision d'un départ incomplet (E6b)
          // et par la révision d'une commande inscrite (plan A2).
          quantity: line.quantity,
          packedAt: line.packed?.at ?? null,
          packedBy: line.packed?.by ?? null,
          packedInitials: line.packed?.initials ?? "",
        },
      });
    }
  }
}
