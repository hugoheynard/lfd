import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineSubscriberRepository } from "../domain/ports/vitrine-subscriber.repository.js";
import type { VitrineSubscriber } from "../domain/vitrine-subscriber.js";
import { subscriberToDomain } from "./vitrine-subscriber.mapper.js";

/** Adaptateur Prisma de l'écriture des abonnés : `upsert` de l'agrégat entier. */
@Injectable()
export class PrismaVitrineSubscriberRepository extends VitrineSubscriberRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<VitrineSubscriber | null> {
    const row = await this.prisma.vitrineSubscriber.findUnique({ where: { id } });
    return row === null ? null : subscriberToDomain(row);
  }

  async listDeliverable(): Promise<readonly VitrineSubscriber[]> {
    const rows = await this.prisma.vitrineSubscriber.findMany({
      where: { active: true, failedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(subscriberToDomain);
  }

  async save(subscriber: VitrineSubscriber): Promise<void> {
    const { id, createdAt, contents, ...rest } = subscriber.toPersistence();
    const row = { ...rest, contents: [...contents] };
    await this.prisma.vitrineSubscriber.upsert({
      where: { id },
      create: { id, createdAt, ...row },
      update: row,
    });
  }
}
