import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import type { CompanyStanding } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { SubAccountMenuAccessReader } from "../domain/ports/sub-account-menu-access.reader.js";

/** La place d'une personne, par la requête partagée de `shared/company-standing/`. */
@Injectable()
export class PrismaSubAccountMenuAccessReader extends SubAccountMenuAccessReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async standingOf(userId: string, companyId: string): Promise<CompanyStanding | null> {
    return readCompanyStanding(this.prisma, this.clock.now(), userId, companyId);
  }
}
