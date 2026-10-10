import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import { UnpaidAccessReader, type UnpaidAccessRole } from "../domain/ports/unpaid-access.reader.js";

/** Le rôle du rattachement, et rien d'autre. */
@Injectable()
export class PrismaUnpaidAccessReader extends UnpaidAccessReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<UnpaidAccessRole | null> {
    const membership = await this.prisma.membership.findFirst({
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
