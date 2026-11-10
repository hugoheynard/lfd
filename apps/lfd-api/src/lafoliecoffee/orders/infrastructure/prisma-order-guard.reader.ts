import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { standingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
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

  /**
   * Le rôle EFFECTIF (S6, R1) : l'`owner` ou l'`admin` du principal passe et
   * chiffre au nom d'un site, plafonné à `admin` (R2, R5).
   */
  async roleOf(userId: string, companyId: string): Promise<OrderRole | null> {
    return standingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, companyId),
    );
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
