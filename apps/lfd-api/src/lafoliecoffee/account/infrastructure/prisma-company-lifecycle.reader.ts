import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyLifecycleReader } from "../domain/ports/company-lifecycle.reader.js";
import type { CompanyStatus } from "../domain/value-objects/company-status.js";

@Injectable()
export class PrismaCompanyLifecycleReader extends CompanyLifecycleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async statusOf(companyId: string): Promise<CompanyStatus | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true },
    });
    return row?.status ?? null;
  }
}
