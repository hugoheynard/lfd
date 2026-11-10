import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineDeliveryRepository } from "../domain/ports/vitrine-delivery.repository.js";
import type { VitrineDelivery } from "../domain/vitrine-delivery.js";
import { deliveryToDomain, deliveryToRow } from "./vitrine-delivery.mapper.js";

/** Adaptateur Prisma de l'écriture des livraisons. */
@Injectable()
export class PrismaVitrineDeliveryRepository extends VitrineDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<VitrineDelivery | null> {
    const row = await this.prisma.vitrineDelivery.findUnique({ where: { id } });
    return row === null ? null : deliveryToDomain(row);
  }

  async pendingChangeOf(subscriberId: string): Promise<VitrineDelivery | null> {
    const row = await this.prisma.vitrineDelivery.findFirst({
      where: { subscriberId, kind: "change", state: "pending" },
    });
    return row === null ? null : deliveryToDomain(row);
  }

  /** Seules celles d'un abonné allumé et pas en échec : un échec arrête tout (B3). */
  async listDue(now: Date, limit: number): Promise<readonly VitrineDelivery[]> {
    const rows = await this.prisma.vitrineDelivery.findMany({
      where: {
        state: "pending",
        nextAttemptAt: { lte: now },
        subscriber: { active: true, failedAt: null },
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    return rows.map(deliveryToDomain);
  }

  async save(delivery: VitrineDelivery): Promise<void> {
    const record = delivery.toPersistence();
    const row = deliveryToRow(record);
    await this.prisma.vitrineDelivery.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        subscriberId: record.subscriberId,
        createdAt: record.createdAt,
        ...row,
      },
      update: row,
    });
  }
}
