import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderSummaryRequesterReader } from "../domain/ports/order-summary-requester.reader.js";

/** Le nom de la société demandeuse, comme le récapitulatif nomme ses tables. */
@Injectable()
export class PrismaOrderSummaryRequesterReader extends OrderSummaryRequesterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(companyId: string): Promise<string | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true, enseigne: true },
    });
    return company === null ? null : companyDisplayName(company);
  }
}
