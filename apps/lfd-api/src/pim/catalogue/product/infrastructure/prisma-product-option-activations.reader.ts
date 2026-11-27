import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  ProductOptionActivationsReader,
  type ActiveOptionActivation,
} from "../domain/ports/product-option-activations.reader.js";

/** Une requête pour toutes les fiches visées, les seules activations non retirées. */
@Injectable()
export class PrismaProductOptionActivationsReader extends ProductOptionActivationsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async activeOf(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly ActiveOptionActivation[]>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productOptionActivation.findMany({
      where: { productId: { in: [...productIds] }, revokedAt: null },
      orderBy: [{ productId: "asc" }, { createdAt: "asc" }, { optionGroupId: "asc" }],
    });
    const found = new Map<string, ActiveOptionActivation[]>();
    for (const row of rows) {
      const list = found.get(row.productId) ?? [];
      list.push({
        groupId: row.optionGroupId,
        variantIds: row.allVariants ? null : [...row.variantIds].sort(),
      });
      found.set(row.productId, list);
    }
    return found;
  }
}
