import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingResupply } from "../domain/entities/packing-resupply.js";
import { PackingResupplyBoardReader } from "../domain/ports/packing-resupply-board.reader.js";
import { PackingResupplyRepository } from "../domain/ports/packing-resupply.repository.js";
import type { PackingResupplySnapshot } from "../domain/entities/packing-resupply.js";
import { assertInsideUnitOfWork } from "./packing-lock.js";
import { RESUPPLY_SELECT, resupplyOf } from "./packing-resupply.rows.js";

/**
 * L'adaptateur Prisma de la fiche de réassort (lot R3b). `lock` pose
 * `FOR UPDATE` sur la fiche — le verrou tient jusqu'au `COMMIT` de l'unité de
 * travail ; `save` écrit la saisie de chaque ligne et la clôture.
 */
@Injectable()
export class PrismaPackingResupplyRepository extends PackingResupplyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(serviceDay: string, resupplyId: string): Promise<PackingResupply | null> {
    assertInsideUnitOfWork(`de la fiche de réassort ${resupplyId} (${serviceDay})`);
    await this.prisma.$queryRaw`
      SELECT "resupply_id" FROM "packing"."packing_resupply"
       WHERE "service_day" = ${serviceDay} AND "resupply_id" = ${resupplyId}
         FOR UPDATE`;
    const row = await this.prisma.packingResupply.findUnique({
      where: { serviceDay_resupplyId: { serviceDay, resupplyId } },
      select: RESUPPLY_SELECT,
    });
    return row === null ? null : PackingResupply.fromSnapshot(resupplyOf(row));
  }

  async save(sheet: PackingResupply): Promise<void> {
    const snapshot = sheet.toSnapshot();
    const key = { serviceDay: snapshot.serviceDay, resupplyId: snapshot.resupplyId };
    for (const line of snapshot.lines) {
      await this.prisma.packingResupplyLine.update({
        where: { serviceDay_resupplyId_sku: { ...key, sku: line.sku } },
        data: {
          packed: line.packed?.quantity ?? null,
          packedAt: line.packed?.at ?? null,
          packedBy: line.packed?.by ?? null,
        },
      });
    }
    await this.prisma.packingResupply.update({
      where: { serviceDay_resupplyId: key },
      data: { closedAt: snapshot.closed?.at ?? null, closedBy: snapshot.closed?.by ?? null },
    });
  }
}

/** Les fiches de réassort d'une journée, pour le poste (lot R3b). */
@Injectable()
export class PrismaPackingResupplyBoardReader extends PackingResupplyBoardReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async on(serviceDay: string): Promise<readonly PackingResupplySnapshot[]> {
    const rows = await this.prisma.packingResupply.findMany({
      where: { serviceDay },
      select: RESUPPLY_SELECT,
      orderBy: [{ siteLabel: "asc" }, { resupplyId: "asc" }],
    });
    return rows.map(resupplyOf);
  }
}
