import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type FrozenResupply,
  FrozenResuppliesReader,
} from "../channels/delivery/frozen-resupplies.reader.js";

/**
 * Les réassorts figés d'une journée (lot R3c) — `production_resupply` et ses
 * lignes, par la clé `(service_day, resupply_id)`. Une journée rouverte a
 * perdu la copie du soir : ses réassorts sont absents. Les lancés « au plus
 * tôt » (R4a) sont dans la même table (`kind = asap`) et la réouverture les
 * garde : ils sont rendus, avec l'instant de leur lancement (R4c).
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
        name: true,
        servedByTransfer: true,
        launchedAt: true,
        lines: {
          orderBy: { sku: "asc" },
          select: { sku: true, productName: true, quantity: true },
        },
      },
    });
    return rows;
  }
}
