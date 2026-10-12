import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerStandingReader, type PayerStanding } from "../domain/ports/payer-standing.reader.js";

/**
 * Le compte et ses périodes `billing` (`company_follows`) qui couvrent
 * l'instant — la même borne `[)` que la contrainte d'exclusion. Le jugement
 * « payeur ou site » est du domaine (`requireBillingPayer`).
 */
@Injectable()
export class PrismaPayerStandingReader extends PayerStandingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingOf(companyId: string, at: Date): Promise<PayerStanding | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        raisonSociale: true,
        enseigne: true,
        follows: {
          where: {
            aspect: "billing",
            validFrom: { lte: at },
            OR: [{ validTo: null }, { validTo: { gt: at } }],
          },
          select: {
            companyId: true,
            parentId: true,
            validFrom: true,
            validTo: true,
            parent: { select: { raisonSociale: true, enseigne: true } },
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    return {
      companyId: row.id,
      name: companyDisplayName(row),
      follows: row.follows.map((follow) => ({
        companyId: follow.companyId,
        payerId: follow.parentId,
        payerName: companyDisplayName(follow.parent),
        validFrom: follow.validFrom,
        validTo: follow.validTo,
      })),
    };
  }
}
