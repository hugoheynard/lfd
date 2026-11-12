import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyChangePruner } from "../domain/ports/company-change.pruner.js";

/**
 * Le balayage de `public.company_change`. Une suppression PHYSIQUE, et c'est
 * permis : ce journal n'est pas un agrégat métier, c'est un numéro d'affichage.
 */
@Injectable()
export class PrismaCompanyChangePruner extends CompanyChangePruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pruneBefore(instant: Date): Promise<number> {
    const { count } = await this.prisma.companyChange.deleteMany({
      where: { changedAt: { lt: instant } },
    });
    return count;
  }
}
