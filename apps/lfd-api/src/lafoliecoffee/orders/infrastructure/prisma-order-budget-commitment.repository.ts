import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBudgetCommitment } from "../domain/entities/order-budget-commitment.js";
import { OrderBudgetCommitmentRepository } from "../domain/ports/order-budget-commitment.repository.js";
import { BudgetCommitment } from "../domain/value-objects/budget-commitment.js";

/** L'engagement d'une commande sur `orders`, sous le verrou de sa ligne (E3′). */
@Injectable()
export class PrismaOrderBudgetCommitmentRepository extends OrderBudgetCommitmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<OrderBudgetCommitment | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        placedByUserId: true,
        companyId: true,
        billedCompanyId: true,
        budgetCommitmentNumber: true,
        budgetCommitmentServiceCode: true,
      },
    });
    if (row === null) {
      return null;
    }
    return OrderBudgetCommitment.fromSnapshot({
      orderId: row.id,
      orderNumber: row.orderNumber,
      placedByUserId: row.placedByUserId,
      // Le payeur copié à la passation ; une commande d'avant la copie se
      // relit sur la société qui l'a passée.
      payerCompanyId: row.billedCompanyId ?? row.companyId,
      commitment: BudgetCommitment.stored(
        row.budgetCommitmentNumber,
        row.budgetCommitmentServiceCode,
      ),
    });
  }

  async save(commitment: OrderBudgetCommitment): Promise<void> {
    const next = commitment.pendingCommitment;
    if (next === undefined) {
      return;
    }
    await this.prisma.order.update({
      where: { id: commitment.orderId },
      data: {
        budgetCommitmentNumber: next === null || next.number === "" ? null : next.number,
        budgetCommitmentServiceCode:
          next === null || next.serviceCode === "" ? null : next.serviceCode,
      },
    });
  }
}
