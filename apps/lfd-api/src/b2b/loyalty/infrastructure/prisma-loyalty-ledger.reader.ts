import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  LoyaltyLedgerReader,
  type LoyaltyBalanceRow,
  type LoyaltyHolderRow,
  type LoyaltyVoucherRow,
} from "../domain/ports/loyalty-ledger.reader.js";
import { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";
import { personLabel } from "./loyalty-holder-label.js";

/** Ce qu'il faut pour nommer un titulaire, sur une ligne du livre ou un bon. */
const HOLDER_SELECT = {
  companyId: true,
  userId: true,
  company: { select: { raisonSociale: true } },
  user: { select: { firstName: true, lastName: true } },
} as const;

interface HolderColumns {
  readonly companyId: string | null;
  readonly userId: string | null;
  readonly company: { readonly raisonSociale: string } | null;
  readonly user: { readonly firstName: string; readonly lastName: string } | null;
}

/**
 * Les lectures de la comptabilité sur la fidélité. Le solde est une somme
 * groupée par titulaire — il n'existe nulle part en colonne (plan D2).
 */
@Injectable()
export class PrismaLoyaltyLedgerReader extends LoyaltyLedgerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listBalances(): Promise<readonly LoyaltyBalanceRow[]> {
    const sums = await this.prisma.loyaltyLedgerEntry.groupBy({
      by: ["companyId", "userId"],
      _sum: { points: true },
    });
    const names = await this.namesOf(sums);
    return sums
      .map((sum) => ({
        holder: holderRow({ ...sum, ...names(sum) }),
        points: sum._sum.points ?? 0,
      }))
      .sort((a, b) => b.points - a.points);
  }

  async listVouchers(): Promise<readonly LoyaltyVoucherRow[]> {
    const rows = await this.prisma.loyaltyVoucher.findMany({
      orderBy: { issuedAt: "desc" },
      select: {
        ...HOLDER_SELECT,
        id: true,
        valueCents: true,
        pointsCost: true,
        ratioPointsPerStep: true,
        ratioStepValueCents: true,
        issuedAt: true,
        expiresAt: true,
        status: true,
        cancelledAt: true,
        cancellationReason: true,
      },
    });
    return rows.map(({ companyId, userId, company, user, ...voucher }) => ({
      ...voucher,
      holder: holderRow({ companyId, userId, company, user }),
    }));
  }

  /** Les noms des titulaires d'une somme groupée : deux lectures, pas une par ligne. */
  private async namesOf(
    keys: readonly { readonly companyId: string | null; readonly userId: string | null }[],
  ): Promise<
    (key: {
      companyId: string | null;
      userId: string | null;
    }) => Pick<HolderColumns, "company" | "user">
  > {
    const companyIds = keys.flatMap((key) => (key.companyId === null ? [] : [key.companyId]));
    const userIds = keys.flatMap((key) => (key.userId === null ? [] : [key.userId]));
    const [companies, users] = await Promise.all([
      this.prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, raisonSociale: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const userById = new Map(users.map((user) => [user.id, user]));
    return (key) => ({
      company: key.companyId === null ? null : (companyById.get(key.companyId) ?? null),
      user: key.userId === null ? null : (userById.get(key.userId) ?? null),
    });
  }
}

/** La base garantit un seul titulaire par ligne (`CHECK`) ; `fromColumns` le revérifie. */
function holderRow(columns: HolderColumns): LoyaltyHolderRow {
  const holder = LoyaltyHolder.fromColumns(columns.companyId, columns.userId);
  const label =
    holder.kind === "company"
      ? (columns.company?.raisonSociale ?? null)
      : columns.user === null
        ? null
        : personLabel(columns.user);
  return { kind: holder.kind, id: holder.id, label };
}
