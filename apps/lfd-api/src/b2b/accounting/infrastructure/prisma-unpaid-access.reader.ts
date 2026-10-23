import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { billingReadingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { UnpaidAccessReader, type UnpaidAccessRole } from "../domain/ports/unpaid-access.reader.js";

/**
 * Le rôle qui ouvre la LECTURE des factures et des impayés : la membership
 * propre, ou le détenteur du principal dans ses sites (S6, Q1) — un `admin`
 * hérité n'y lit rien. Toutes les routes de ce port sont des lectures
 * (vérifié le 2026-10-23).
 */
@Injectable()
export class PrismaUnpaidAccessReader extends UnpaidAccessReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<UnpaidAccessRole | null> {
    return billingReadingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId),
    );
  }
}
