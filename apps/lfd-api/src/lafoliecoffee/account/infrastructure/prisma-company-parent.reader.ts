import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyParentReader, type CompanyParent } from "../domain/ports/company-parent.reader.js";

@Injectable()
export class PrismaCompanyParentReader extends CompanyParentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async parentOf(companyId: string): Promise<CompanyParent | null> {
    return this.prisma.company.findUnique({
      where: { id: companyId },
      select: { parentCompanyId: true },
    });
  }
}
