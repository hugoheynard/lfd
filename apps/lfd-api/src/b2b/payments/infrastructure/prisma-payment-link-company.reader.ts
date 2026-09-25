import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PaymentLinkCompanyReader } from "../domain/ports/payment-link-company.reader.js";

@Injectable()
export class PrismaPaymentLinkCompanyReader extends PaymentLinkCompanyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<string | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true, enseigne: true },
    });
    if (row === null) {
      return null;
    }
    // La règle de `Company.displayName()` : l'enseigne, à défaut la raison sociale.
    return row.enseigne === "" ? row.raisonSociale : row.enseigne;
  }
}
