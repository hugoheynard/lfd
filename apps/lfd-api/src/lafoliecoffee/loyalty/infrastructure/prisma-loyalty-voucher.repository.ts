import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyVoucher } from "../domain/entities/loyalty-voucher.js";
import { LoyaltyVoucherChangedMeanwhileError } from "../domain/errors/voucher-restitution-errors.js";
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
  mergedBackAt: true,
  mergedBackOrderId: true,
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
 *
 * **L'écriture est conditionnée au statut chargé** depuis le lot C3b (C3b.2) :
 * un bon reconstitué ne s'écrit que si la base porte encore le statut lu.
 * Zéro ligne sur un bon qui existe pour ce titulaire →
 * {@link LoyaltyVoucherChangedMeanwhileError}, jamais une création : un
 * instantané périmé n'écrase ni un `expired`, ni un `merged_back`.
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

  async loadLiveRemainderOf(parentId: string): Promise<LoyaltyVoucher | null> {
    // Au plus une ligne : l'index unique partiel `loyalty_vouchers_live_remainder_key`.
    const row = await this.prisma.loyaltyVoucher.findFirst({
      where: { parentVoucherId: parentId, status: { not: "merged_back" } },
      select: VOUCHER_SELECT,
    });
    return row === null ? null : LoyaltyVoucher.reconstitute(row);
  }

  async save(voucher: LoyaltyVoucher): Promise<void> {
    const { id, ...columns } = voucher.toPersistence();
    const holder = { companyId: columns.companyId, userId: columns.userId };
    const loaded = voucher.persistedStatus;
    const { count } = await this.prisma.loyaltyVoucher.updateMany({
      where: { id, ...holder, ...(loaded === null ? {} : { status: loaded }) },
      // Seul ce qu'une transition change : le montant, le coût, le ratio et
      // les dates d'un bon sont figés à son émission.
      data: {
        status: columns.status,
        remainderSettledAt: columns.remainderSettledAt,
        expiredAt: columns.expiredAt,
        cancelledAt: columns.cancelledAt,
        cancelledByStaffId: columns.cancelledByStaffId,
        cancellationReason: columns.cancellationReason,
        mergedBackAt: columns.mergedBackAt,
        mergedBackOrderId: columns.mergedBackOrderId,
      },
    });
    if (count > 0) {
      return;
    }
    if (loaded !== null) {
      const ours = await this.prisma.loyaltyVoucher.count({ where: { id, ...holder } });
      if (ours > 0) {
        throw new LoyaltyVoucherChangedMeanwhileError(id);
      }
    }
    await this.prisma.loyaltyVoucher.create({ data: { id, ...columns } });
  }
}
