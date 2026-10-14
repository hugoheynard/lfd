import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ClosedPlansReader } from "../channels/commerce/closed-plans.reader.js";

/**
 * Lit `production_day.closed_at` sur une plage de jours. La clé est un
 * `AAAA-MM-JJ` en texte : la comparaison lexicale est chronologique.
 *
 * Passe par le client ROUTÉ : appelé dans une unité de travail (sous le
 * verrou du guichet), il lit dans la transaction en cours.
 */
@Injectable()
export class PrismaClosedPlansReader extends ClosedPlansReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async closedBetween(from: string, to: string): Promise<readonly string[]> {
    const rows = await this.prisma.productionDay.findMany({
      where: { serviceDay: { gte: from, lte: to }, closedAt: { not: null } },
      select: { serviceDay: true },
      orderBy: { serviceDay: "asc" },
    });
    return rows.map((row) => row.serviceDay);
  }
}
