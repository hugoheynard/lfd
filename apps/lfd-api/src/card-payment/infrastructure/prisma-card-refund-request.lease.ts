import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { CardRefundRequestLease } from "../domain/ports/card-refund-request.lease.js";

/**
 * Le bail par UNE écriture conditionnée : deux exécuteurs simultanés ne
 * peuvent pas franchir tous deux le `where` — Postgres sérialise les deux
 * `UPDATE` sur la même ligne, et le second relit `claimed_until` à jour.
 */
@Injectable()
export class PrismaCardRefundRequestLease extends CardRefundRequestLease {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(requestId: string, token: string, until: Date, wallNow: Date): Promise<boolean> {
    const claimed = await this.prisma.cardRefundRequest.updateMany({
      where: {
        id: requestId,
        state: "to_issue",
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: wallNow } }],
      },
      data: { claimedUntil: until, claimToken: token },
    });
    return claimed.count === 1;
  }
}
