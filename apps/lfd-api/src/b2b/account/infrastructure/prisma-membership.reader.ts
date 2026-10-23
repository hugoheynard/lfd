import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { standingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { MembershipReader } from "../domain/ports/membership.reader.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";

/** Adaptateur Prisma du lecteur de rôle : la requête partagée de `b2b/shared/company-standing/`. */
@Injectable()
export class PrismaMembershipReader extends MembershipReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  /**
   * Le rôle EFFECTIF — propre ou hérité du principal (S6, R1) : lu par la
   * requête partagée, jamais recopié ici.
   */
  async roleOf(userId: string, companyId: string): Promise<CompanyRole | null> {
    return standingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId),
    );
  }
}
