import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PolicyPromotionNamesReader } from "../domain/ports/policy-promotion-names.reader.js";

/** Les noms internes, archivées comprises ; un identifiant inconnu n'y est pas. */
@Injectable()
export class PrismaPolicyPromotionNamesReader extends PolicyPromotionNamesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async namesOf(promotionIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (promotionIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.promotion.findMany({
      where: { id: { in: [...promotionIds] } },
      select: { id: true, internalName: true },
    });
    return new Map(rows.map((row) => [row.id, row.internalName]));
  }
}
