import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  HolderLoyaltyReader,
  type HolderEntryRow,
  type HolderVoucherRow,
} from "../domain/ports/holder-loyalty.reader.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";

const VOUCHER_SELECT = {
  id: true,
  valueCents: true,
  issuedAt: true,
  expiresAt: true,
  status: true,
} as const;

/**
 * L'espace d'un titulaire, en Postgres. Chaque requête filtre sur les DEUX
 * colonnes du titulaire (`company_id`, `user_id`), l'une valant `null` : une
 * ligne d'une société ne répond jamais à une personne, ni l'inverse.
 */
@Injectable()
export class PrismaHolderLoyaltyReader extends HolderLoyaltyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async balanceOf(holder: LoyaltyHolder): Promise<number> {
    const sum = await this.prisma.loyaltyLedgerEntry.aggregate({
      where: wall(holder),
      _sum: { points: true },
    });
    return sum._sum.points ?? 0;
  }

  async recentEntries(holder: LoyaltyHolder, limit: number): Promise<readonly HolderEntryRow[]> {
    return this.prisma.loyaltyLedgerEntry.findMany({
      where: wall(holder),
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, kind: true, points: true, occurredAt: true, orderId: true },
    });
  }

  async liveVouchers(holder: LoyaltyHolder): Promise<readonly HolderVoucherRow[]> {
    return this.prisma.loyaltyVoucher.findMany({
      where: { ...wall(holder), status: { in: ["available", "reserved"] } },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      select: VOUCHER_SELECT,
    });
  }

  async recentClosedVouchers(
    holder: LoyaltyHolder,
    limit: number,
  ): Promise<readonly HolderVoucherRow[]> {
    return this.prisma.loyaltyVoucher.findMany({
      where: { ...wall(holder), status: { in: ["expired", "cancelled"] } },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: limit,
      select: VOUCHER_SELECT,
    });
  }
}

function wall(holder: LoyaltyHolder): { companyId: string | null; userId: string | null } {
  return { companyId: holder.companyId, userId: holder.userId };
}
