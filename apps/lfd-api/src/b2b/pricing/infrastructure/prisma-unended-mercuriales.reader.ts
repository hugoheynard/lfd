import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { UnendedMercurialesReader } from "../domain/ports/unended-mercuriales.reader.js";
import { LIVE_AMENDMENTS, mercurialeFromRow } from "./mercuriale-rows.js";

/** Non closes, et dont la fin n'est pas passée — en pause comprises (elles reprendront). */
@Injectable()
export class PrismaUnendedMercurialesReader extends UnendedMercurialesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unendedAt(at: Date): Promise<readonly CompanyMercuriale[]> {
    const rows = await this.prisma.companyMercuriale.findMany({
      where: { archivedAt: null, OR: [{ validTo: null }, { validTo: { gt: at } }] },
      orderBy: [{ companyId: "asc" }, { validFrom: "asc" }],
      include: LIVE_AMENDMENTS,
    });
    return rows.map((row) => mercurialeFromRow(row));
  }
}
