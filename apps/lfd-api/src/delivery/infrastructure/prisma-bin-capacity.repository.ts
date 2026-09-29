import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { BinCapacity } from "../domain/entities/bin-capacity.js";
import { BinCapacityRepository } from "../domain/ports/bin-capacity.repository.js";

/** Adaptateur Prisma de la grille des contenances. */
@Injectable()
export class PrismaBinCapacityRepository extends BinCapacityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async unitsOf(binTypeId: string, sku: string): Promise<number | null> {
    const row = await this.prisma.deliveryBinCapacity.findUnique({
      where: { binTypeId_sku: { binTypeId, sku } },
      select: { units: true },
    });
    return row?.units ?? null;
  }

  async save(capacity: BinCapacity, at: Date): Promise<void> {
    const { binTypeId, sku, units } = capacity;
    await this.prisma.deliveryBinCapacity.upsert({
      where: { binTypeId_sku: { binTypeId, sku } },
      create: { binTypeId, sku, units, updatedAt: at },
      update: { units, updatedAt: at },
    });
  }

  async remove(binTypeId: string, sku: string): Promise<void> {
    // `deleteMany` : retirer une case déjà vide ne lève pas (course entre deux écrans).
    await this.prisma.deliveryBinCapacity.deleteMany({ where: { binTypeId, sku } });
  }
}
