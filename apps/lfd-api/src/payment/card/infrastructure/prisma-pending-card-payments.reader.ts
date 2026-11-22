import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PendingCardPaymentsReader } from "../domain/ports/pending-card-payments.reader.js";
import type { ProviderCheckSelection } from "../domain/services/provider-check-schedule.js";

/**
 * La file du balayage des paiements en attente — servie par l'index partiel
 * `card_payment_provider_check_idx` (`provider_checked_at NULLS FIRST,
 * created_at`, `WHERE state IN ('pending', 'failed')`).
 */
@Injectable()
export class PrismaPendingCardPaymentsReader extends PendingCardPaymentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dueForProviderCheck(selection: ProviderCheckSelection): Promise<readonly string[]> {
    const rows = await this.prisma.cardPayment.findMany({
      where: {
        state: { in: ["pending", "failed"] },
        providerRef: { not: null },
        role: { not: "complement" },
        OR: selection.bands.map((band) => ({
          createdAt: { gte: band.createdFrom, lt: band.createdBefore },
          OR: [{ providerCheckedAt: null }, { providerCheckedAt: { lt: band.checkedBefore } }],
        })),
      },
      orderBy: [{ providerCheckedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: selection.limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
