import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { OptionGroupHoldersReader } from "../../../reference/product-options/domain/ports/option-group-holders.reader.js";

/**
 * Ce que le référentiel des options demande à la fiche, répondu par celle qui
 * écrit l'activation : les fiches où un groupe est actif.
 */
@Injectable()
export class PrismaOptionGroupHoldersReader extends OptionGroupHoldersReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async productsHolding(groupId: string): Promise<readonly string[]> {
    const rows = await this.prisma.productOptionActivation.findMany({
      where: { optionGroupId: groupId, revokedAt: null },
      select: { productId: true },
      orderBy: { productId: "asc" },
    });
    return rows.map((row) => row.productId);
  }

  async countByGroup(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.productOptionActivation.groupBy({
      by: ["optionGroupId"],
      where: { revokedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.optionGroupId, row._count._all]));
  }
}
