import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import { MembershipReader } from "../domain/ports/membership.reader.js";
import type { CompanyRole } from "../domain/value-objects/company-role.js";

/** Adaptateur Prisma du lecteur de rôle. */
@Injectable()
export class PrismaMembershipReader extends MembershipReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<CompanyRole | null> {
    const membership = await this.prisma.membership.findFirst({
      // Une personne n'a qu'un rattachement par entreprise, donc au plus un
      // rôle — et seul un rattachement qui OUVRE compte (§8.1 bis, 2026-10-10).
      where: { userId, companyId, ...openingMembership(this.clock.now()) },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
