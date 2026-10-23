import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { standingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../domain/ports/bank-account-guard.reader.js";

/**
 * Adaptateur Prisma du mur des GESTES sur le RIB et le mandat : le rôle
 * effectif (S6, R1) — l'héritier est `admin`, refusé ; la lecture a son
 * propre port (`BankAccountReadingGuard`, Q1).
 */
@Injectable()
export class PrismaBankAccountGuardReader extends BankAccountGuardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    return standingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId),
    );
  }
}
