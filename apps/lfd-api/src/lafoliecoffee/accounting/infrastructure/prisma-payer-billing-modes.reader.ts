import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PayerBillingModesReader,
  type PayerModeSegments,
} from "../domain/ports/payer-billing-modes.reader.js";
import type { PayerModeSegment } from "../domain/services/payer-timeline.js";
import { payerModeSegmentOf } from "./billing-mode.mapper.js";

/** Les segments VIVANTS de `payer_billing_mode`, par payeur. */
@Injectable()
export class PrismaPayerBillingModesReader extends PayerBillingModesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async segmentsOf(legalEntityId: string): Promise<readonly PayerModeSegments[]> {
    const rows = await this.prisma.payerBillingMode.findMany({
      where: { legalEntityId, cancelledAt: null },
      select: { payerCompanyId: true, mode: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    });
    const byPayer = new Map<string, PayerModeSegment[]>();
    for (const row of rows) {
      const segments = byPayer.get(row.payerCompanyId) ?? [];
      segments.push(payerModeSegmentOf(row));
      byPayer.set(row.payerCompanyId, segments);
    }
    return [...byPayer].map(([payerCompanyId, segments]) => ({ payerCompanyId, segments }));
  }

  async segmentsOfPayer(
    legalEntityId: string,
    payerCompanyId: string,
  ): Promise<readonly PayerModeSegment[]> {
    const rows = await this.prisma.payerBillingMode.findMany({
      where: { legalEntityId, payerCompanyId, cancelledAt: null },
      select: { mode: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    });
    return rows.map(payerModeSegmentOf);
  }
}
