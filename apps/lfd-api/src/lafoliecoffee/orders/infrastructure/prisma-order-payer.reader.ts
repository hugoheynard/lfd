import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderPayerReader, type OrderPayerStanding } from "../domain/ports/order-payer.reader.js";

/**
 * La période maison vivante (`withdrawn_at` nul) : une au plus, tenue par
 * l'index unique partiel `payer_in_house_live_company`.
 */
const LIVE_IN_HOUSE = { where: { withdrawnAt: null }, select: { id: true }, take: 1 } as const;

/**
 * La société qui commande, son principal, et les périodes `billing` et
 * `pricing` qui la couvrent à `at` —
 * début inclus, fin exclue, la borne de la contrainte d'exclusion de
 * `company_follows` : il y en a donc une au plus par aspect.
 */
@Injectable()
export class PrismaOrderPayerReader extends OrderPayerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingAt(companyId: string, at: Date): Promise<OrderPayerStanding | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        raisonSociale: true,
        groupWithoutDelivery: true,
        parentCompanyId: true,
        inHouse: LIVE_IN_HOUSE,
        // `billing` ET `pricing` : la contrainte d'exclusion en garde une au
        // plus par aspect, donc deux lignes au plus.
        follows: {
          where: {
            aspect: { in: ["billing", "pricing"] },
            validFrom: { lte: at },
            OR: [{ validTo: null }, { validTo: { gt: at } }],
          },
          select: {
            aspect: true,
            parentId: true,
            parent: { select: { raisonSociale: true, status: true, inHouse: LIVE_IN_HOUSE } },
          },
        },
      },
    });
    if (company === null) {
      return null;
    }
    const follow = company.follows.find((period) => period.aspect === "billing");
    return {
      companyId: company.id,
      companyName: company.raisonSociale,
      groupWithoutDelivery: company.groupWithoutDelivery,
      billingFollow:
        follow === undefined
          ? null
          : {
              payerId: follow.parentId,
              payerName: follow.parent.raisonSociale,
              payerStatus: follow.parent.status,
              payerInHouse: follow.parent.inHouse.length > 0,
            },
      principalId: company.parentCompanyId,
      followsPricing: company.follows.some((period) => period.aspect === "pricing"),
      inHouse: company.inHouse.length > 0,
    };
  }
}
