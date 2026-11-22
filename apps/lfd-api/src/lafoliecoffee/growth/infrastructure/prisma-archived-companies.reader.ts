import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ArchivedCompaniesReader } from "../domain/ports/archived-companies.reader.js";

/** Adaptateur Prisma : une lecture par lot, l'identifiant seul. */
@Injectable()
export class PrismaArchivedCompaniesReader extends ArchivedCompaniesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async among(companyIds: readonly string[]): Promise<ReadonlySet<string>> {
    // Un `in: []` rendrait zéro ligne, mais paierait l'aller-retour.
    if (companyIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...new Set(companyIds)] }, archivedAt: { not: null } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }
}
