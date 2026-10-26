import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { OrderOpeningExemption } from "../domain/order-opening-exemption.js";
import { OrderOpeningExemptionRepository } from "../domain/ports/order-opening-exemption.repository.js";
import { exemptionToDomain, exemptionToPersistence } from "./order-opening-exemption.mapper.js";

/** Adaptateur Prisma de l'écriture des exemptions : un `upsert` par l'identifiant, jamais un effacement. */
@Injectable()
export class PrismaOrderOpeningExemptionRepository extends OrderOpeningExemptionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<OrderOpeningExemption | null> {
    const row = await this.prisma.orderOpeningExemption.findUnique({ where: { id } });
    return row === null ? null : exemptionToDomain(row);
  }

  async save(exemption: OrderOpeningExemption): Promise<void> {
    const row = exemptionToPersistence(exemption);
    await this.prisma.orderOpeningExemption.upsert({
      where: { id: row.id },
      create: row,
      update: {
        withdrawnAt: row.withdrawnAt,
        withdrawnByStaffId: row.withdrawnByStaffId,
        withdrawnByName: row.withdrawnByName,
        withdrawnByRole: row.withdrawnByRole,
      },
    });
  }
}
