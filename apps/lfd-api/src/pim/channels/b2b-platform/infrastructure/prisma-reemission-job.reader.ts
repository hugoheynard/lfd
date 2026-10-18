import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { CatalogReemissionJobSnapshot } from "../domain/entities/catalog-reemission-job.js";
import { ReemissionJobReader } from "../domain/ports/reemission-job.reader.js";
import { snapshotOf } from "./reemission-job.mapper.js";

/** La lecture des réémissions : la plus récente d'abord, l'identifiant (ULID) départage. */
@Injectable()
export class PrismaReemissionJobReader extends ReemissionJobReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async latest(): Promise<CatalogReemissionJobSnapshot | null> {
    const row = await this.prisma.catalogReemissionJob.findFirst({
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    });
    return row === null ? null : snapshotOf(row);
  }

  async byId(id: string): Promise<CatalogReemissionJobSnapshot | null> {
    const row = await this.prisma.catalogReemissionJob.findUnique({ where: { id } });
    return row === null ? null : snapshotOf(row);
  }
}
