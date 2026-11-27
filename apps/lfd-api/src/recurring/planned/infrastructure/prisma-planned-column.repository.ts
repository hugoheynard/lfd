import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../platform/database/json-columns.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { IsoDate } from "../../basket/domain/value-objects/iso-date.js";
import type { PlannedColumn } from "../domain/entities/planned-column.js";
import {
  PlannedColumnVersionConflictError,
  PlannedWindowTakenError,
} from "../domain/errors/planned-column-errors.js";
import {
  PlannedColumnRepository,
  type PlannedColumnSlot,
} from "../domain/ports/planned-column.repository.js";
import { plannedColumnFields, plannedColumnFromRow } from "./planned-column-row.mapper.js";

/** Le statut d'une colonne retirée, tel qu'il est écrit. */
const WITHDRAWN = "withdrawn";
/** Le statut d'un brouillon, tel qu'il est écrit — celui que l'index partiel du balayage couvre. */
const DRAFT = "draft";

/**
 * Adaptateur Prisma d'écriture des colonnes : l'agrégat ↔
 * `recurring.planned_columns`. Chaque requête porte la société dans son
 * `where` ; la mise à jour est conditionnée à la version lue. Rejoint
 * l'unité de travail ambiante.
 */
@Injectable()
export class PrismaPlannedColumnRepository extends PlannedColumnRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string, columnId: string): Promise<PlannedColumn | null> {
    const row = await this.prisma.plannedColumn.findFirst({ where: { id: columnId, companyId } });
    return row === null ? null : plannedColumnFromRow(row);
  }

  async loadSlot(slot: PlannedColumnSlot): Promise<PlannedColumn | null> {
    const row = await this.prisma.plannedColumn.findFirst({
      where: {
        companyId: slot.companyId,
        serviceDay: slot.serviceDay.toUtcDate(),
        windowStart: slot.windowStart,
        windowEnd: slot.windowEnd,
        status: { not: WITHDRAWN },
      },
    });
    return row === null ? null : plannedColumnFromRow(row);
  }

  async draftsThrough(lastDay: IsoDate, limit: number): Promise<PlannedColumn[]> {
    const rows = await this.prisma.plannedColumn.findMany({
      where: { status: DRAFT, serviceDay: { lte: lastDay.toUtcDate() } },
      orderBy: [{ serviceDay: "asc" }, { convertsAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(plannedColumnFromRow);
  }

  async save(day: PlannedColumn, at: Date): Promise<number> {
    const snapshot = day.snapshot();
    try {
      if (day.isNew) {
        await this.prisma.plannedColumn.create({
          data: {
            id: snapshot.id,
            companyId: snapshot.companyId,
            serviceDay: snapshot.serviceDay.toUtcDate(),
            ...plannedColumnFields(snapshot),
            version: 1,
            createdAt: at,
            updatedAt: at,
          },
        });
        return 1;
      }
      const next = snapshot.version + 1;
      const { count } = await this.prisma.plannedColumn.updateMany({
        where: { id: snapshot.id, companyId: snapshot.companyId, version: snapshot.version },
        data: { ...plannedColumnFields(snapshot), version: next, updatedAt: at },
      });
      if (count === 0) {
        throw new PlannedColumnVersionConflictError(snapshot.serviceDay.value);
      }
      return next;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PlannedWindowTakenError(snapshot.serviceDay.value);
      }
      throw error;
    }
  }
}
