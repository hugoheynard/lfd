import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DayPackingProgressReader } from "../../production/channels/packing/index.js";

/**
 * « Le colisage de cette journée a-t-il commencé ? » — implémente le port que
 * le fournil déclare pour refuser une réouverture (2026-10-14).
 *
 * Un contenant compte même annulé : ses lignes restent, et la liste du jour
 * ne se retire pas sous elles (clé étrangère `Restrict`). Les bacs comptés à
 * l'ancienne (`container_count`) et les bacs fermés comptent aussi.
 */
@Injectable()
export class PrismaDayPackingProgressReader extends DayPackingProgressReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async startedOn(serviceDay: string): Promise<boolean> {
    const containers = await this.prisma.packingContainer.count({ where: { serviceDay } });
    if (containers > 0) {
      return true;
    }
    const lines = await this.prisma.packingLine.count({
      where: { serviceDay, packedAt: { not: null } },
    });
    if (lines > 0) {
      return true;
    }
    const orders = await this.prisma.packingOrder.count({
      where: { serviceDay, OR: [{ packedAt: { not: null } }, { containerCount: { gt: 0 } }] },
    });
    return orders > 0;
  }
}
