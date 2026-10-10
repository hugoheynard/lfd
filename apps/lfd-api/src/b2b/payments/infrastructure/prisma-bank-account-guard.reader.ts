import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../domain/ports/bank-account-guard.reader.js";

/** Adaptateur Prisma du mur du RIB : le rôle du rattachement, et rien d'autre. */
@Injectable()
export class PrismaBankAccountGuardReader extends BankAccountGuardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<BankAccountRole | null> {
    const membership = await this.prisma.membership.findFirst({
      // Clé composite unique : une personne n'a qu'un rattachement par société.
      where: {
        userId,
        companyId,
        // Seul un rattachement qui OUVRE compte (§8.1 bis, 2026-10-10).
        ...openingMembership(this.clock.now()),
      },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}
