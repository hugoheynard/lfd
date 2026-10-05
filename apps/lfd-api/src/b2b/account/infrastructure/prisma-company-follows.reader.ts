import { Injectable } from "@nestjs/common";
import type { CompanyFollowAspect } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyFollowsReader } from "../domain/ports/company-follows.reader.js";
import type { FollowPeriod } from "../domain/value-objects/follow-period.js";
import { FOLLOW_SELECT, periodOf } from "./company-follows.mapper.js";

/**
 * Lecture à date des suivis : la période qui couvre `at`, début inclus, fin
 * exclue — la même borne que `tstzrange(valid_from, valid_to, '[)')` de la
 * contrainte d'exclusion, donc une seule période au plus.
 */
@Injectable()
export class PrismaCompanyFollowsReader extends CompanyFollowsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async followsAt(
    companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null> {
    const row = await this.prisma.companyFollow.findFirst({
      where: {
        companyId,
        aspect,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      select: FOLLOW_SELECT,
    });
    return row === null ? null : periodOf(row);
  }
}
