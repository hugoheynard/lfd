import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import {
  OrderGuardReader,
  type AccountSettlementStanding,
  type OrderCompanyStatus,
  type OrderRole,
} from "../domain/ports/order-guard.reader.js";

/** Adaptateur Prisma des garde-fous : rôle du membre + statut de l'entreprise. */
@Injectable()
export class PrismaOrderGuardReader extends OrderGuardReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<OrderRole | null> {
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

  async companyStatusOf(companyId: string): Promise<OrderCompanyStatus | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true },
    });
    return company?.status ?? null;
  }

  async settlesOnAccount(companyId: string): Promise<AccountSettlementStanding> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { grantedTerms: true, directDebitBlockedAt: true },
    });
    // Aucun crédit accordé — ou société inconnue : on encaisse tout de suite.
    if (company === null || company.grantedTerms.length === 0) {
      return "none";
    }
    // Le crédit reste accordé ; seul le prélèvement est suspendu.
    return company.directDebitBlockedAt === null ? "granted" : "blocked";
  }
}
