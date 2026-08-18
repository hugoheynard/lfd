import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import {
  OrderGuardReader,
  type OrderCompanyStatus,
  type OrderRole,
} from "../domain/ports/order-guard.reader.js";

/** Adaptateur Prisma des garde-fous : rôle du membre + statut de l'entreprise. */
@Injectable()
export class PrismaOrderGuardReader extends OrderGuardReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roleOf(userId: string, companyId: string): Promise<OrderRole | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
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

  async settlesOnAccount(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { grantedTerms: true },
    });
    // Aucun crédit accordé — ou société inconnue : on encaisse tout de suite.
    return (company?.grantedTerms.length ?? 0) > 0;
  }
}
