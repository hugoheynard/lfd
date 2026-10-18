import { Injectable } from "@nestjs/common";

import { isUniqueViolation } from "../../../../platform/database/json-columns.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CatalogReemissionJob } from "../domain/entities/catalog-reemission-job.js";
import { ReemissionAlreadyRunningError } from "../domain/errors/reemission-errors.js";
import { ReemissionJobRepository } from "../domain/ports/reemission-job.repository.js";
import { rowOf, snapshotOf } from "./reemission-job.mapper.js";

const RUNNING = "running";

/**
 * Les réémissions, rangées dans `pim.catalog_reemission_job`.
 *
 * `save` est un `upsert` de l'état entier : le travail s'écrit à chaque fiche,
 * et c'est l'agrégat — pas une écriture de colonne — qui dit ce qui change.
 */
@Injectable()
export class PrismaReemissionJobRepository extends ReemissionJobRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async save(job: CatalogReemissionJob): Promise<void> {
    const row = rowOf(job.snapshot());
    try {
      await this.prisma.catalogReemissionJob.upsert({
        where: { id: row.id },
        create: row,
        update: row,
      });
    } catch (error) {
      // L'index partiel `catalog_reemission_job_one_running_all` : un second
      // « tout » arrivé entre la garde du lanceur et cette écriture.
      if (isUniqueViolation(error)) {
        throw new ReemissionAlreadyRunningError(null);
      }
      throw error;
    }
  }

  async runningEverything(): Promise<CatalogReemissionJob | null> {
    const row = await this.prisma.catalogReemissionJob.findFirst({
      where: { status: RUNNING, scope: "all" },
    });
    return row === null ? null : CatalogReemissionJob.restore(snapshotOf(row));
  }

  async running(): Promise<CatalogReemissionJob[]> {
    const rows = await this.prisma.catalogReemissionJob.findMany({
      where: { status: RUNNING },
      orderBy: { startedAt: "asc" },
    });
    return rows.map((row) => CatalogReemissionJob.restore(snapshotOf(row)));
  }
}
