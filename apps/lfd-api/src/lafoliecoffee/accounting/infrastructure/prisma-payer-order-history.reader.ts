import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerOrderHistoryReader } from "../domain/ports/payer-order-history.reader.js";
import { accountOrderWhere } from "./billable-order-criterion.js";

/**
 * Part de l'assiette sans fenêtre (`accountOrderWhere` : au compte, payante,
 * non annulée) et y ajoute tous les chemins de rattachement au payeur : la
 * société qui commande, le payeur copié à la passation (`billed_company_id`),
 * le principal copié à la passation, un site qui le suit aujourd'hui
 * (`parent_company_id`) ou l'a suivi un jour (`company_follows`, tous aspects).
 */
@Injectable()
export class PrismaPayerOrderHistoryReader extends PayerOrderHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasEverOrdered(payerCompanyId: string): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: {
        AND: [
          accountOrderWhere(),
          {
            OR: [
              { companyId: payerCompanyId },
              { billedCompanyId: payerCompanyId },
              { principalCompanyId: payerCompanyId },
              { company: { parentCompanyId: payerCompanyId } },
              { company: { follows: { some: { parentId: payerCompanyId } } } },
            ],
          },
        ],
      },
      select: { id: true },
    });
    return order !== null;
  }
}
