import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ExportReaderKey } from "../domain/entities/export-reader-key.js";
import { ExportReaderKeyLookup } from "../domain/ports/export-reader-key.lookup.js";
import { exportReaderKeyToDomain } from "./export-reader-key.mapper.js";

/** Adaptateur Prisma de la garde : une lecture par l'index unique du haché. */
@Injectable()
export class PrismaExportReaderKeyLookup extends ExportReaderKeyLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findBySecretHash(secretHash: string): Promise<ExportReaderKey | null> {
    const row = await this.prisma.exportReaderKey.findUnique({ where: { secretHash } });
    return row === null ? null : exportReaderKeyToDomain(row);
  }
}
