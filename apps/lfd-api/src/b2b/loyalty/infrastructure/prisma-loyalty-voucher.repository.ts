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
  remainderSettledAt: true,
  expiredAt: true,
  cancelledAt: true,
  cancelledByStaffId: true,
  cancellationReason: true,
} as const;

/**
 * Adaptateur Prisma des bons : `load` → `reconstitute`, `save` ←
 * `toPersistence`. Aucune écriture de statut à partir de primitives.
 *
 * **Le mur est dans l'écriture** depuis le 2026-10-07 : `save` met à jour sous
 * `{ id, companyId, userId }` et ne crée qu'à défaut. Le mur d'un bon est son
 * TITULAIRE, la société OU la personne (`CHECK` d'un seul titulaire) : les deux
 * colonnes, l'une nulle. `company_id` seul ne garderait rien entre deux
 * particuliers, dont les bons portent tous `NULL`. Un `id` déjà pris par un
 * autre titulaire n'est jamais réécrit : sa création se heurte à la clé
 * primaire (`P2002`, 409 par `mapPersistenceError`). C'était un `upsert` sur le
 * seul `id` : le défaut B2 de `documentation/livraisons/audit-2026-10-07.md`,
 * retrouvé ici en le corrigeant ailleurs.
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

  async loadReservedUnsettled(
    after: string | null,
    limit: number,
  ): Promise<readonly LoyaltyVoucher[]> {
    const rows = await this.prisma.loyaltyVoucher.findMany({
      where: {
        status: "reserved",
        remainderSettledAt: null,
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: "asc" },
      take: limit,
      select: VOUCHER_SELECT,
    });
    return rows.map((row) => LoyaltyVoucher.reconstitute(row));
  }

  async save(voucher: LoyaltyVoucher): Promise<void> {
    const { id, ...columns } = voucher.toPersistence();
    const { count } = await this.prisma.loyaltyVoucher.updateMany({
      where: { id, companyId: columns.companyId, userId: columns.userId },
      // Seul ce qu'une transition change : le montant, le coût, le ratio et
      // les dates d'un bon sont figés à son émission.
      data: {
        status: columns.status,
        remainderSettledAt: columns.remainderSettledAt,
        expiredAt: columns.expiredAt,
        cancelledAt: columns.cancelledAt,
        cancelledByStaffId: columns.cancelledByStaffId,
        cancellationReason: columns.cancellationReason,
      },
    });
    if (count === 0) {
      await this.prisma.loyaltyVoucher.create({ data: { id, ...columns } });
    }
  }
}
