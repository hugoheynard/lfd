import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingSheet, type SheetLine } from "../domain/entities/packing-sheet.js";
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
    });
  }

  async save(sheet: PackingSheet): Promise<void> {
    const snapshot = sheet.toSnapshot();
    await this.prisma.packingOrder.update({
      where: { serviceDay_orderId: { serviceDay: snapshot.serviceDay, orderId: snapshot.orderId } },
      data: {
        packedAt: snapshot.packed?.at ?? null,
        packedBy: snapshot.packed?.by ?? null,
        containerCount: snapshot.containers,
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
          packedAt: line.packed?.at ?? null,
          packedBy: line.packed?.by ?? null,
          packedInitials: line.packed?.initials ?? "",
        },
      });
    }
  }
}
