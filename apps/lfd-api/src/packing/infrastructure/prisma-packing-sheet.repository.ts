import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { PackingSheet } from "../domain/entities/packing-sheet.js";
import { saveContainers } from "./packing-container.mapper.js";
import { loadPackingSheet } from "./packing-sheet.load.js";
import { PackingSheetRepository } from "../domain/ports/packing-sheet.repository.js";
import { assertInsideUnitOfWork } from "./packing-lock.js";

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

  async lock(serviceDay: string, orderId: string, rank: number): Promise<PackingSheet | null> {
    assertInsideUnitOfWork(`du bac ${orderId} (${serviceDay}, rang ${String(rank)})`);
    await this.prisma.$queryRaw`
      SELECT "order_id" FROM "packing"."packing_order"
       WHERE "service_day" = ${serviceDay} AND "order_id" = ${orderId} AND "rank" = ${rank}
         FOR UPDATE`;
    return loadPackingSheet(this.prisma, serviceDay, orderId, rank);
  }

  async lockLatestOf(orderId: string, rank: number): Promise<PackingSheet | null> {
    assertInsideUnitOfWork(`du bac le plus récent de ${orderId} (rang ${String(rank)})`);
    const days = await this.prisma.$queryRaw<{ service_day: string }[]>`
      SELECT "service_day" FROM "packing"."packing_order"
       WHERE "order_id" = ${orderId} AND "rank" = ${rank}
       ORDER BY "service_day" DESC
       LIMIT 1
         FOR UPDATE`;
    const day = days[0]?.service_day;
    return day === undefined ? null : this.lock(day, orderId, rank);
  }

  async save(sheet: PackingSheet): Promise<void> {
    const snapshot = sheet.toSnapshot();
    await this.prisma.packingOrder.update({
      where: {
        serviceDay_orderId_rank: {
          serviceDay: snapshot.serviceDay,
          orderId: snapshot.orderId,
          rank: sheet.rank,
        },
      },
      data: {
        packedAt: snapshot.packed?.at ?? null,
        packedBy: snapshot.packed?.by ?? null,
        containerCount: snapshot.containers,
        shortfallReportedAt: snapshot.shortfallReportedAt ?? null,
        shortfallAuthorizedAt: snapshot.shortfallAuthorizedAt ?? null,
        withdrawnAt: snapshot.withdrawnAt ?? null,
      },
    });
    await saveContainers(this.prisma, snapshot, sheet.rank);
    // Une ligne absente de l'agrégat en est sortie : décidée à zéro au départ
    // incomplet (E6b). Rien d'autre ne retire une ligne d'une fiche vivante.
    await this.prisma.packingLine.deleteMany({
      where: {
        serviceDay: snapshot.serviceDay,
        orderId: snapshot.orderId,
        rank: sheet.rank,
        sku: { notIn: snapshot.lines.map((line) => line.sku) },
      },
    });
    for (const line of snapshot.lines) {
      await this.prisma.packingLine.update({
        where: {
          serviceDay_orderId_rank_sku: {
            serviceDay: snapshot.serviceDay,
            orderId: snapshot.orderId,
            rank: sheet.rank,
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
