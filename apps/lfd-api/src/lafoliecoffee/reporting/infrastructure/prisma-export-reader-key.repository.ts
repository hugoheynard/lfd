import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ExportReaderKey } from "../domain/entities/export-reader-key.js";
import { ExportReaderKeyRepository } from "../domain/ports/export-reader-key.repository.js";
import { exportReaderKeyToDomain } from "./export-reader-key.mapper.js";

/**
 * Adaptateur Prisma de l'écriture des clés. Seules la révocation et ses
 * auteurs changent après la création : le reste n'est écrit qu'une fois, et
 * l'adaptateur ne lui donne pas l'occasion de bouger.
 */
@Injectable()
export class PrismaExportReaderKeyRepository extends ExportReaderKeyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<ExportReaderKey | null> {
    const row = await this.prisma.exportReaderKey.findUnique({ where: { id } });
    return row === null ? null : exportReaderKeyToDomain(row);
  }

  async save(key: ExportReaderKey): Promise<void> {
    const state = key.toPersistence();
    await this.prisma.exportReaderKey.upsert({
      where: { id: state.id },
      create: { ...state, allowedIps: [...state.allowedIps] },
      update: { revokedAt: state.revokedAt, revokedByStaffId: state.revokedByStaffId },
    });
  }
}
