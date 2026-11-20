import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ParticularNoShowCountsReader } from "../domain/ports/particular-no-show-counts.reader.js";

/**
 * Le compte des commandes non retirées par client — une requête groupée, la
 * même qu'aurait écrite l'appelant : `status = 'no_show'`, par `placed_by_user_id`.
 */
@Injectable()
export class PrismaParticularNoShowCountsReader extends ParticularNoShowCountsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async countsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.order.groupBy({
      by: ["placedByUserId"],
      where: { placedByUserId: { in: [...userIds] }, status: "no_show" },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.placedByUserId, group._count._all]));
  }
}
