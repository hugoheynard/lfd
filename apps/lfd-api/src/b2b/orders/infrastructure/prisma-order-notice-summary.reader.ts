import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderNoticeSummaryReader,
  type OrderNoticeSummary,
} from "../domain/ports/order-notice-summary.reader.js";
import { settlementDecidedAtPlacement } from "../domain/services/settlement-decided-at-placement.js";

/** Adaptateur Prisma : la commande, ses copies de passation, et le nom de sa société. */
@Injectable()
export class PrismaOrderNoticeSummaryReader extends OrderNoticeSummaryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async summaryOf(orderId: string): Promise<OrderNoticeSummary | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        companyId: true,
        principalCompanyId: true,
        principalSeesAmount: true,
        billedCompanyId: true,
        totalCents: true,
        createdAt: true,
        requestedDeliveryDate: true,
        placedByUserId: true,
        placedByStaffId: true,
        paymentStatus: true,
        company: { select: { raisonSociale: true, enseigne: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      orderId,
      orderNumber: row.orderNumber,
      companyId: row.companyId,
      // La règle de `Company.displayName()` : l'enseigne, à défaut la raison sociale.
      companyName:
        row.company === null
          ? null
          : row.company.enseigne === ""
            ? row.company.raisonSociale
            : row.company.enseigne,
      principalCompanyId: row.principalCompanyId,
      principalSeesAmount: row.principalSeesAmount === true,
      billedCompanyId: row.billedCompanyId,
      totalCents: row.totalCents,
      placedAt: row.createdAt,
      requestedFor: row.requestedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      placedByUserId: row.placedByUserId,
      settledAtPlacement: settlementDecidedAtPlacement(row.paymentStatus),
      enteredByTeam: row.placedByStaffId !== null,
    };
  }
}
