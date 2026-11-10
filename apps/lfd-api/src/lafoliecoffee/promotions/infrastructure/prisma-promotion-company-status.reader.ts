import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import { PromotionCompanyStatusReader } from "../domain/ports/promotion-company-status.reader.js";

/** Le statut d'une société, relu à chaque question — jamais d'un jeton ni d'un cache. */
@Injectable()
export class PrismaPromotionCompanyStatusReader extends PromotionCompanyStatusReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async companyStatusOf(companyId: string): Promise<StandingCompanyStatus | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true },
    });
    return company?.status ?? null;
  }
}
