import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderPayerReader, type OrderPayerStanding } from "../domain/ports/order-payer.reader.js";

/**
 * La société qui commande, et la période `billing` qui la couvre à `at` —
 * début inclus, fin exclue, la borne de la contrainte d'exclusion de
 * `company_follows` : il y en a donc une au plus.
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
        follows: {
          where: {
            aspect: "billing",
            validFrom: { lte: at },
            OR: [{ validTo: null }, { validTo: { gt: at } }],
          },
          take: 1,
          select: {
            parentId: true,
            parent: { select: { raisonSociale: true, status: true } },
          },
        },
      },
    });
    if (company === null) {
      return null;
    }
    const follow = company.follows[0];
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
            },
    };
  }
}
