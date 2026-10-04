import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { PackedMark, ProductionBatchSnapshot } from "../domain/entities/production-day.js";
import {
  ProductionBatchRepository,
  type RecordedBatch,
} from "../domain/ports/production-batch.repository.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Les colonnes d'une fournée qu'on relit — la même forme au chargement de la journée. */
export const BATCH_COLUMNS = {
  id: true,
  serviceDay: true,
  sku: true,
  quantity: true,
  recordedAt: true,
  recordedBy: true,
  initials: true,
  cancelledAt: true,
  cancelledBy: true,
} as const;

/** Une ligne de `production_batch`, telle que {@link BATCH_COLUMNS} la lit. */
interface BatchRow {
  readonly id: string;
  readonly sku: string;
  readonly quantity: number;
  readonly recordedAt: Date;
  readonly recordedBy: string;
  readonly initials: string;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
}

/** Ce que les demandes de retour disent d'une fournée (K2) — zéro sans demande. */
export interface BatchReturns {
  readonly returned: number;
  readonly pendingReturn: number;
}

const NO_RETURN: BatchReturns = { returned: 0, pendingReturn: 0 };

/** Une demande de retour, telle que le chargement de la journée la lit. */
interface ReturnRow {
  readonly batchId: string;
  readonly quantity: number;
  readonly returned: number | null;
}

/**
 * Les demandes de retour d'une journée, par fournée : rendu (réponses) et en
 * attente (sans réponse). `returned` nul = pas encore de réponse (CHECK).
 */
export function returnsByBatch(rows: readonly ReturnRow[]): ReadonlyMap<string, BatchReturns> {
  const byBatch = new Map<string, BatchReturns>();
  for (const row of rows) {
    const known = byBatch.get(row.batchId) ?? NO_RETURN;
    byBatch.set(
      row.batchId,
      row.returned === null
        ? { ...known, pendingReturn: known.pendingReturn + row.quantity }
        : { ...known, returned: known.returned + row.returned },
    );
  }
  return byBatch;
}

/**
 * Ligne → fournée. L'annulation est recollée en un couple, ou `null` : le CHECK
 * de la table interdit l'un sans l'autre, et l'agrégat ne connaît pas cet état.
 */
export function batchOf(row: BatchRow, returns: BatchReturns = NO_RETURN): ProductionBatchSnapshot {
  return {
    id: row.id,
    sku: row.sku,
    quantity: row.quantity,
    recorded: { at: row.recordedAt, by: row.recordedBy, initials: row.initials },
    cancelled:
      row.cancelledAt === null || row.cancelledBy === null
        ? null
        : { at: row.cancelledAt, by: row.cancelledBy },
    returned: returns.returned,
    pendingReturn: returns.pendingReturn,
  };
}

/** L'adaptateur Prisma des fournées. Aucun type `Prisma.*` ne sort d'ici. */
@Injectable()
export class PrismaProductionBatchRepository extends ProductionBatchRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `createMany({ skipDuplicates })` compile en `INSERT … ON CONFLICT DO
   * NOTHING` : un rejeu simultané ne lève pas de violation d'unicité, il
   * n'écrit rien. La relecture par `id` dit ensuite qui a gagné.
   */
  async record(day: ServiceDay, batch: ProductionBatchSnapshot): Promise<RecordedBatch> {
    await this.prisma.productionBatch.createMany({
      data: [
        {
          id: batch.id,
          serviceDay: day.value,
          sku: batch.sku,
          quantity: batch.quantity,
          recordedAt: batch.recorded.at,
          recordedBy: batch.recorded.by,
          initials: batch.recorded.initials,
          cancelledAt: batch.cancelled?.at ?? null,
          cancelledBy: batch.cancelled?.by ?? null,
        },
      ],
      skipDuplicates: true,
    });
    const stored = await this.prisma.productionBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: BATCH_COLUMNS,
    });
    return { serviceDay: stored.serviceDay, batch: batchOf(stored) };
  }

  async cancel(day: ServiceDay, id: string, mark: PackedMark): Promise<void> {
    await this.prisma.productionBatch.updateMany({
      where: { id, serviceDay: day.value, cancelledAt: null },
      data: { cancelledAt: mark.at, cancelledBy: mark.by },
    });
  }
}
