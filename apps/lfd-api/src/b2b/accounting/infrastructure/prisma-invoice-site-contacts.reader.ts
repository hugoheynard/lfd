import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoiceSiteContactsReader } from "../domain/ports/invoice-site-contacts.reader.js";

/**
 * Les sociétés qui ont passé les bons (`orders.company_id`), sauf le payeur,
 * puis leurs adresses de facturation : contacts `billing`
 * (`company_contacts`) et membres `billing` (`memberships` → `users.email`).
 * Tables du compte client et de la commande, dans le même bloc `b2b` : une
 * lecture, jamais une écriture.
 */
@Injectable()
export class PrismaInvoiceSiteContactsReader extends InvoiceSiteContactsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async billingEmailsOf(
    orderIds: readonly string[],
    payerCompanyId: string,
  ): Promise<readonly string[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, companyId: { not: null } },
      select: { companyId: true },
    });
    const siteIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.companyId === null || order.companyId === payerCompanyId ? [] : [order.companyId],
        ),
      ),
    ].sort();
    if (siteIds.length === 0) {
      return [];
    }
    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId: { in: siteIds }, role: "billing" },
      orderBy: [{ companyId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { email: true },
    });
    const members = await this.prisma.membership.findMany({
      where: { companyId: { in: siteIds }, role: "billing" },
      orderBy: [{ companyId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { user: { select: { email: true } } },
    });
    return [
      ...contacts.map((contact) => contact.email),
      ...members.map((member) => member.user.email),
    ];
  }
}
