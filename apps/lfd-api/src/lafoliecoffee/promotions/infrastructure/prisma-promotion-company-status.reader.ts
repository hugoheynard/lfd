import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CLOSING_STATUS,
  isCompanyClosed,
} from "../../shared/company-standing/domain/company-closure.js";
import type { StandingCompanyStatus } from "../../shared/company-standing/domain/company-standing.js";
import { PromotionCompanyStatusReader } from "../domain/ports/promotion-company-status.reader.js";

/**
 * Le statut d'une société, relu à chaque question — jamais d'un jeton ni d'un
 * cache. Une société FERMÉE (`isCompanyClosed` : supprimée ou résiliée) répond
 * le statut qui ferme : les publics la jugent alors comme `companyServiceOf`
 * juge une société close, et un compte supprimé resté `active` n'est pas un
 * « pro actif ».
 */
@Injectable()
export class PrismaPromotionCompanyStatusReader extends PromotionCompanyStatusReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async companyStatusOf(companyId: string): Promise<StandingCompanyStatus | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true, archivedAt: true },
    });
    if (company === null) {
      return null;
    }
    return isCompanyClosed(company) ? CLOSING_STATUS : company.status;
  }
}
