import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type FrozenResupply,
  FrozenResuppliesReader,
} from "../channels/delivery/frozen-resupplies.reader.js";

/**
 * Les réassorts figés d'une journée (lot R3c) — `production_resupply` et ses
 * lignes, par la clé `(service_day, resupply_id)`. Une journée rouverte a
 * perdu sa copie : ses réassorts sont absents.
 */
@Injectable()
export class PrismaFrozenResuppliesReader extends FrozenResuppliesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async frozenOf(
    serviceDay: string,
    resupplyIds: readonly string[],
  ): Promise<readonly FrozenResupply[]> {
    if (resupplyIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.productionResupply.findMany({
      where: { serviceDay, resupplyId: { in: [...resupplyIds] } },
      orderBy: { resupplyId: "asc" },
      select: {
        resupplyId: true,
        serviceDay: true,
        siteId: true,
        siteLabel: true,
        servedByTransfer: true,
        lines: {
          orderBy: { sku: "asc" },
          select: { sku: true, productName: true, quantity: true },
        },
      },
    });
    return rows;
  }
}
