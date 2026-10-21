import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyLabelReader } from "../domain/ports/company-label.reader.js";

/** L'enseigne si elle est renseignée, sinon la raison sociale. Lecture seule, même bloc `b2b`. */
@Injectable()
export class PrismaCompanyLabelReader extends CompanyLabelReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async labelOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { enseigne: true, raisonSociale: true },
    });
    if (company === null) {
      return null;
    }
    return company.enseigne.trim() === "" ? company.raisonSociale : company.enseigne;
  }
}
