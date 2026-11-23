import type { ExportReaderKeyView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ExportReaderKeyReader } from "../domain/ports/export-reader-key.reader.js";

/** Adaptateur Prisma de la liste : le haché n'est jamais sélectionné. */
@Injectable()
export class PrismaExportReaderKeyReader extends ExportReaderKeyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<ExportReaderKeyView[]> {
    const rows = await this.prisma.exportReaderKey.findMany({
      select: {
        id: true,
        label: true,
        createdAt: true,
        createdByStaffId: true,
        expiresAt: true,
        revokedAt: true,
        revokedByStaffId: true,
        allowedIps: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  }
}
