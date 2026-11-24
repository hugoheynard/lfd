import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerUninvoicedOrdersReader } from "../../account/domain/ports/payer-uninvoiced-orders.reader.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import { accountOrderWhere } from "./billable-order-criterion.js";

/**
 * Une commande **au compte** de ce payeur (le critère de l'assiette,
 * `accountOrderWhere`) qu'aucune facture 380 ne porte encore. Le payeur est
 * `COALESCE(billed_company_id, company_id)`, la règle de tout ce qui touche
 * l'argent. Livrée ou non : une commande à venir sera facturée sous le mode
 * où elle a été passée.
 */
@Injectable()
export class PrismaPayerUninvoicedOrdersReader extends PayerUninvoicedOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasUninvoicedOrders(payerCompanyId: string): Promise<boolean> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...accountOrderWhere(),
        OR: [
          { billedCompanyId: payerCompanyId },
          { billedCompanyId: null, companyId: payerCompanyId },
        ],
      },
      select: { id: true },
    });
    if (orders.length === 0) {
      return false;
    }
    const invoiced = await this.prisma.invoiceOrder.count({
      where: { invoiceType: COMMERCIAL_INVOICE, orderId: { in: orders.map((order) => order.id) } },
    });
    return invoiced < orders.length;
  }
}
