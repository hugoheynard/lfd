import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InHouseBillingNeighboursReader,
  type InHouseBillingNeighbours,
} from "../domain/ports/in-house-billing-neighbours.reader.js";

const BILLING = "billing" as const;

/** La période vivante, au plus une (index unique partiel). */
const LIVE = { where: { withdrawnAt: null }, select: { id: true }, take: 1 } as const;

/** Les deux sens des suivis `billing` qui couvrent `at`, et leur nature maison, en une requête. */
@Injectable()
export class PrismaInHouseBillingNeighboursReader extends InHouseBillingNeighboursReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async neighboursOf(companyId: string, at: Date): Promise<InHouseBillingNeighbours> {
    const rows = await this.prisma.companyFollow.findMany({
      where: {
        aspect: BILLING,
        validFrom: { lte: at },
        AND: [
          { OR: [{ validTo: null }, { validTo: { gt: at } }] },
          { OR: [{ companyId }, { parentId: companyId }] },
        ],
      },
      select: {
        companyId: true,
        company: { select: { inHouse: LIVE } },
        parent: { select: { inHouse: LIVE } },
      },
    });
    const followed = rows.find((row) => row.companyId === companyId);
    return {
      principalInHouse: followed === undefined ? null : followed.parent.inHouse.length > 0,
      sites: rows
        .filter((row) => row.companyId !== companyId)
        .map((row) => ({ companyId: row.companyId, inHouse: row.company.inHouse.length > 0 })),
    };
  }
}
