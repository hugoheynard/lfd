import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PaymentLinkReader, type PaymentLinkEntry } from "../domain/ports/payment-link.reader.js";

/**
 * La liste des liens libres, la plus récente en tête. Bornée : c'est une page
 * de suivi, pas un grand livre — les liens plus anciens restent en base.
 */
const LIST_LIMIT = 500;

@Injectable()
export class PrismaPaymentLinkReader extends PaymentLinkReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly PaymentLinkEntry[]> {
    const rows = await this.prisma.paymentLink.findMany({
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        companyId: true,
        amountCents: true,
        label: true,
        status: true,
        url: true,
        createdAt: true,
        createdByStaffId: true,
        paidAt: true,
        cancelledAt: true,
        cancelledByStaffId: true,
        company: { select: { raisonSociale: true, enseigne: true } },
      },
    });
    return rows.map(({ company, ...row }) => ({
      ...row,
      // La règle de `Company.displayName()` : l'enseigne, à défaut la raison sociale.
      companyName: company.enseigne === "" ? company.raisonSociale : company.enseigne,
    }));
  }
}
