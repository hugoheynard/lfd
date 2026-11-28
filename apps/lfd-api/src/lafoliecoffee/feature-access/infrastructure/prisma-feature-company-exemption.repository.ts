import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { FeatureCompanyExemption } from "../domain/feature-company-exemption.js";
import {
  FeatureCompanyExemptionRepository,
  type RemovedCompanyExemption,
} from "../domain/ports/feature-company-exemption.repository.js";

/** Adaptateur Prisma des exemptions par société. Appelé sous `UnitOfWork`. */
@Injectable()
export class PrismaFeatureCompanyExemptionRepository extends FeatureCompanyExemptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `createMany` avec `skipDuplicates` : un ajout concurrent de la même
   * société ne lève pas, il compte zéro ligne — et l'appelant refuse.
   */
  async addIfAbsent(exemption: FeatureCompanyExemption): Promise<boolean> {
    const { count } = await this.prisma.featureAccessCompanyExemption.createMany({
      data: [
        {
          key: exemption.key,
          companyId: exemption.companyId,
          companyName: exemption.companyName,
          createdAt: exemption.at,
          createdByStaffId: exemption.author.staffUserId,
          createdByName: exemption.author.name,
          createdByRole: exemption.author.role,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async remove(key: string, companyId: string): Promise<RemovedCompanyExemption | null> {
    const existing = await this.prisma.featureAccessCompanyExemption.findUnique({
      where: { key_companyId: { key, companyId } },
      select: { companyName: true },
    });
    if (existing === null) {
      return null;
    }
    await this.prisma.featureAccessCompanyExemption.deleteMany({ where: { key, companyId } });
    return { companyName: existing.companyName };
  }
}
