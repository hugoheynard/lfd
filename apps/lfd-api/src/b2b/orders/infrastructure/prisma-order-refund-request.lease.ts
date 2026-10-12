import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderRefundRequestLease } from "../domain/ports/order-refund-request.lease.js";

/**
 * Le bail par UNE écriture conditionnée : deux exécuteurs simultanés ne
 * peuvent pas franchir tous deux le `where` — Postgres sérialise les deux
 * `UPDATE` sur la même ligne, et le second relit `claimed_until` à jour.
 */
@Injectable()
export class PrismaOrderRefundRequestLease extends OrderRefundRequestLease {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(orderId: string, token: string, until: Date, wallNow: Date): Promise<boolean> {
    const claimed = await this.prisma.orderRefundRequest.updateMany({
      where: { orderId, OR: [{ claimedUntil: null }, { claimedUntil: { lt: wallNow } }] },
      data: { claimedUntil: until, claimToken: token },
    });
    return claimed.count === 1;
  }
}
