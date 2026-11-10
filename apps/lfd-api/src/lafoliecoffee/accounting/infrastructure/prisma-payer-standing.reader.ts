import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerStandingReader, type PayerStanding } from "../domain/ports/payer-standing.reader.js";
import { payerStandingOf, payerStandingSelect } from "./payer-standing.mapper.js";

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
      select: payerStandingSelect(at),
    });
    return row === null ? null : payerStandingOf(row);
  }
}
