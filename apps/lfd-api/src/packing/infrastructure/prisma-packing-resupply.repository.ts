import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingResupply } from "../domain/entities/packing-resupply.js";
import { PackingResupplyBoardReader } from "../domain/ports/packing-resupply-board.reader.js";
import { PackingResupplyRepository } from "../domain/ports/packing-resupply.repository.js";
import type { PackingResupplySnapshot } from "../domain/entities/packing-resupply.js";
import { assertInsideUnitOfWork } from "./packing-lock.js";
import { RESUPPLY_SELECT, resupplyOf } from "./packing-resupply.rows.js";

/**
 * L'adaptateur Prisma de la fiche de réassort (R3b). `lock` pose
 * `FOR UPDATE` sur la fiche — le verrou tient jusqu'au `COMMIT` de l'unité de
 * travail ; `save` écrit la saisie de toutes les lignes (une requête) et la
 * clôture.
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
    // Une fiche retirée par la réouverture n'existe plus pour le poste.
    const row = await this.prisma.packingResupply.findFirst({
      where: { serviceDay, resupplyId, withdrawnAt: null },
      select: RESUPPLY_SELECT,
    });
    return row === null ? null : PackingResupply.fromSnapshot(resupplyOf(row));
  }

  async save(sheet: PackingResupply): Promise<void> {
    const snapshot = sheet.toSnapshot();
    const key = { serviceDay: snapshot.serviceDay, resupplyId: snapshot.resupplyId };
    // Toutes les lignes en UNE requête (M-E, audit du 2026-11-02) : une
    // `update` par ligne, sous le verrou de la fiche, jusque-là.
    const lines = snapshot.lines;
    if (lines.length > 0) {
      await this.prisma.$executeRaw`
        UPDATE "packing"."packing_resupply_line" AS line
           SET "packed" = given.packed,
               "packed_at" = given.packed_at,
               "packed_by" = given.packed_by
          FROM unnest(
                 ${lines.map((line) => line.sku)}::text[],
                 ${lines.map((line) => line.packed?.quantity ?? null)}::integer[],
                 ${lines.map((line) => line.packed?.at ?? null)}::timestamptz[],
                 ${lines.map((line) => line.packed?.by ?? null)}::text[]
               ) AS given(sku, packed, packed_at, packed_by)
         WHERE line."service_day" = ${key.serviceDay}
           AND line."resupply_id" = ${key.resupplyId}
           AND line."sku" = given.sku`;
    }
    await this.prisma.packingResupply.update({
      where: { serviceDay_resupplyId: key },
      data: { closedAt: snapshot.closed?.at ?? null, closedBy: snapshot.closed?.by ?? null },
    });
  }
}

/** Les fiches de réassort d'une journée, pour le poste (R3b). */
@Injectable()
export class PrismaPackingResupplyBoardReader extends PackingResupplyBoardReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async on(serviceDay: string): Promise<readonly PackingResupplySnapshot[]> {
    const rows = await this.prisma.packingResupply.findMany({
      where: { serviceDay, withdrawnAt: null },
      select: RESUPPLY_SELECT,
      orderBy: [{ siteLabel: "asc" }, { resupplyId: "asc" }],
    });
    return rows.map(resupplyOf);
  }
}
