import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { billingReadingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { BankAccountReadingGuard } from "../domain/ports/bank-account-reading-guard.js";
import type { BankAccountRole } from "../domain/ports/bank-account-guard.reader.js";

/** Le rôle de lecture de la facturation, par la requête partagée (S6, Q1). */
@Injectable()
export class PrismaBankAccountReadingGuard extends BankAccountReadingGuard {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    return billingReadingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId),
    );
  }
}
