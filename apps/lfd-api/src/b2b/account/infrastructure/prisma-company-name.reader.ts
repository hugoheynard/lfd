import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyNameReader } from "../domain/ports/company-name.reader.js";

/** La même règle que `Company.displayName` : l'enseigne, sinon la raison sociale. */
@Injectable()
export class PrismaCompanyNameReader extends CompanyNameReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<string | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (row === null) {
      return null;
    }
    return row.enseigne === "" ? row.raisonSociale : row.enseigne;
  }
}
