import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  BillingNatureNeighboursReader,
  type BillingNatureNeighbours,
} from "../domain/ports/billing-nature-neighbours.reader.js";

const BILLING = "billing" as const;

/** Les deux sens des suivis `billing` qui couvrent `at`, en une requête. */
@Injectable()
export class PrismaBillingNatureNeighboursReader extends BillingNatureNeighboursReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async neighboursOf(companyId: string, at: Date): Promise<BillingNatureNeighbours> {
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
        company: { select: { formeJuridique: true } },
        parent: { select: { formeJuridique: true } },
      },
    });
    const followed = rows.find((row) => row.companyId === companyId);
    return {
      principalForm: followed?.parent.formeJuridique ?? null,
      siteForms: rows
        .filter((row) => row.companyId !== companyId)
        .map((row) => row.company.formeJuridique),
    };
  }
}
