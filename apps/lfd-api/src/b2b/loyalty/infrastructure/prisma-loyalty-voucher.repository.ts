import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyVoucher } from "../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherRepository } from "../domain/ports/loyalty-voucher.repository.js";

/** Les colonnes que l'agrégat range — `select` explicite, pas la ligne entière. */
const VOUCHER_SELECT = {
  id: true,
  companyId: true,
  userId: true,
  valueCents: true,
  pointsCost: true,
  ratioPointsPerStep: true,
  ratioStepValueCents: true,
  issuedAt: true,
  expiresAt: true,
  status: true,
  parentVoucherId: true,
  expiredAt: true,
  cancelledAt: true,
  cancelledByStaffId: true,
  cancellationReason: true,
} as const;

/**
 * Adaptateur Prisma des bons : `load` → `reconstitute`, `save` ←
 * `toPersistence`. Aucune écriture de statut à partir de primitives.
 */
@Injectable()
export class PrismaLoyaltyVoucherRepository extends LoyaltyVoucherRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<LoyaltyVoucher | null> {
    const row = await this.prisma.loyaltyVoucher.findUnique({
      where: { id },
      select: VOUCHER_SELECT,
    });
    return row === null ? null : LoyaltyVoucher.reconstitute(row);
  }

  async loadDueForExpiry(now: Date, limit: number): Promise<readonly LoyaltyVoucher[]> {
    const rows = await this.prisma.loyaltyVoucher.findMany({
      where: { status: "available", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: VOUCHER_SELECT,
    });
    return rows.map((row) => LoyaltyVoucher.reconstitute(row));
  }

  async save(voucher: LoyaltyVoucher): Promise<void> {
    const { id, ...columns } = voucher.toPersistence();
    await this.prisma.loyaltyVoucher.upsert({
      where: { id },
      create: { id, ...columns },
      // Seul ce qu'une transition change : le montant, le coût, le ratio et
      // les dates d'un bon sont figés à son émission.
      update: {
        status: columns.status,
        expiredAt: columns.expiredAt,
        cancelledAt: columns.cancelledAt,
        cancelledByStaffId: columns.cancelledByStaffId,
        cancellationReason: columns.cancellationReason,
      },
    });
  }
}
