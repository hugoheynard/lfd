import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CardIncreaseLease } from "../domain/ports/card-increase-lease.js";

/**
 * Le bail par UNE écriture conditionnée, comme `PrismaCardRefundRequestLease` :
 * deux exécuteurs simultanés ne franchissent pas tous deux le `where` —
 * Postgres sérialise les deux `UPDATE` sur la même ligne, et le second relit
 * `leased_until` à jour.
 */
@Injectable()
export class PrismaCardIncreaseLease extends CardIncreaseLease {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(proposalId: string, until: Date, wallNow: Date): Promise<boolean> {
    const claimed = await this.prisma.orderRevisionProposal.updateMany({
      where: {
        id: proposalId,
        state: "ready",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: wallNow } }],
        AND: [{ OR: [{ leasedUntil: null }, { leasedUntil: { lt: wallNow } }] }],
      },
      data: { leasedUntil: until },
    });
    return claimed.count === 1;
  }
}
