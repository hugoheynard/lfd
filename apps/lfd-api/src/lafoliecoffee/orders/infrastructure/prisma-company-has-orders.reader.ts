import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyHasOrdersReader } from "../domain/ports/company-has-orders.reader.js";

/**
 * Une EXISTENCE, la même requête qu'aurait écrite l'appelant : une commande
 * hors brouillon où le compte est la société, le principal ou le payeur.
 * Lue par `PrismaService`, donc dans la transaction ambiante quand il y en a une.
 */
@Injectable()
export class PrismaCompanyHasOrdersReader extends CompanyHasOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasOrders(companyId: string): Promise<boolean> {
    const row = await this.prisma.order.findFirst({
      where: {
        status: { not: "draft" },
        OR: [{ companyId }, { principalCompanyId: companyId }, { billedCompanyId: companyId }],
      },
      select: { id: true },
    });
    return row !== null;
  }
}
