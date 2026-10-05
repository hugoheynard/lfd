import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SubAccountFollows } from "../domain/entities/sub-account-follows.js";
import { CompanyFollowsRepository } from "../domain/ports/company-follows.repository.js";
import { FOLLOW_SELECT, periodOf } from "./company-follows.mapper.js";

/**
 * Le dépôt des suivis. Une période s'identifie par (société, aspect, début) —
 * la clé primaire —, donc `save` est un `upsert` par période : les neuves
 * s'insèrent, les fermées prennent leur fin, rien ne s'efface.
 */
@Injectable()
export class PrismaCompanyFollowsRepository extends CompanyFollowsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<SubAccountFollows> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId },
      orderBy: { validFrom: "asc" },
      select: FOLLOW_SELECT,
    });
    return SubAccountFollows.reconstitute(companyId, rows.map(periodOf));
  }

  async save(follows: SubAccountFollows): Promise<void> {
    // Les fermetures d'abord : une période rouverte sur le même aspect ne doit
    // pas croiser, le temps d'une instruction, celle qu'elle remplace.
    const ordered = [...follows.periods].sort((a, b) => Number(a.isOpen) - Number(b.isOpen));
    for (const period of ordered) {
      await this.prisma.companyFollow.upsert({
        where: {
          companyId_aspect_validFrom: {
            companyId: follows.companyId,
            aspect: period.aspect,
            validFrom: period.validFrom,
          },
        },
        create: {
          companyId: follows.companyId,
          parentId: period.parentId,
          aspect: period.aspect,
          validFrom: period.validFrom,
          validTo: period.validTo,
        },
        update: { validTo: period.validTo },
      });
    }
  }
}
